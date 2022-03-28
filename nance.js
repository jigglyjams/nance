import { Client as notionClient } from '@notionhq/client';
import { Client as discordClient, Intents, MessageEmbed } from 'discord.js';
import schedule from 'node-schedule';
import { keys } from './keys.js';
import { log } from './utils.js';
import { config } from './config.js';

const notion = new notionClient({ auth: keys.NOTION_KEY })

const discord = new discordClient({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS] });
discord.once('ready', async c => {
  log(`Ready! Logged in as ${c.user.tag}`);
});
discord.login(keys.DISCORD_KEY);

async function checkNotionDb(dbId, dbFilter, dbSort=[]) {
  try { 
    return await notion.databases.query({
      database_id: dbId,
      filter: dbFilter,
      sorts: dbSort
    })
  } catch(e) {
    log('issue querying notion db');
    log(e);
  }
}

async function queueNextGovernanceAction(){
  const calendar = await checkNotionDb(config.governanceDb.id, config.governanceDb.filter, config.governanceDb.sorts)
  const nextEvent = calendar.results[0].properties
  const nextDate = new Date(nextEvent.Date.date.start)
  const nextAction = nextEvent.Tags.multi_select.map(tag => {
    return tag.name
  }).join(', ')
  let action;
  if (nextAction === 'Governance Cycle, Temperature Check'){
    action = schedule.scheduleJob(nextDate, () => {
      //temperatureCheckSetup();
    })  
  } else if (nextAction === 'Governance Cycle, Voting Off-Chain'){
    action = schedule.scheduleJob(nextDate, () => {
      //votingOffChainSetup();
    })
  }
  action.on('success', () => {
    queueNextGovernanceAction()
  })
}

async function updateProperty(pageId, property, updateData) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      [`${property}`]: updateData
    }
  })
}

async function startThread(proposal) {
  // notion api sometimes splits out the title into multiple objects, map into single string separated by ' '
  const proposalTitle = proposal.properties.Name.title.map(t => {
    return t.plain_text
  }).join(' ');
  const proposalUrl = proposal.url;
  const discordChannel = discord.channels.cache.get(config.channelId);

  // some proposals have multiple categories, map them into a single string separated by ' & '
  const proposalType = proposal.properties.Category.multi_select.map(p => {
    return p.name
  }).join(' & ');
  
  const message = await discordChannel.send(`New **${proposalType}** proposal: ${proposalUrl}`);
  return message.startThread({
    name: proposalTitle,
    autoArchiveDuration: 60*24
  }).then(thread => {
    return `https://discord.com/channels/${config.guildId}/${config.channelId}/${thread.id}`;
  });
}

async function handleDiscussions(){
  checkNotionDb(config.proposalDb.id, config.proposalDb.filter).then(r=>{
    r.results.forEach((p) => {
      startThread(p).then((url)=> { 
        updateProperty(p.id, 'Discussion Thread', {url: url});
        log(`New proposal to dicsuss: ${p.url}`);
      });
    })
  });
}

//setInterval(handleDiscussions, 1*60*1000);
queueNextGovernanceAction()