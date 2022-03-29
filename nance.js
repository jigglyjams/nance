import { Client as notionClient } from '@notionhq/client';
import { Client as discordClient, Intents, MessageEmbed } from 'discord.js';
import schedule from 'node-schedule';
import { keys } from './keys.js';
import { log, sleep } from './utils.js';
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
      temperatureCheckSetup();
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

async function getProposalIdNum() {
  config.proposalDb.proposalIdFilter.property = config.proposalIdProperty
  const proposalsWithIds = await checkNotionDb(config.proposalDb.id, config.proposalDb.proposalIdFilter)
  const sortedProposalIds = proposalsWithIds.results.map(p => {
    return parseInt(p.properties[config.proposalIdProperty].rich_text[0].plain_text.split(config.proposalIdPrefix)[1])
  }).sort((a,b) => { return b - a });
  return sortedProposalIds[0];
}

async function temperatureCheckSetup() {
  const currentProposalId = await getProposalIdNum()
  const discussions = await checkNotionDb(config.proposalDb.id, config.proposalDb.discussionFilter)
  discussions.results.forEach( async (d, i) => {
    const nextProposalId = currentProposalId + 1 + i
    updateProperty(d.id, 'Status', { select: { name: 'Temperature Check' }})
    const discordThreadUrl = d.properties['Discussion Thread'].url.split('/')
    const discordThreadId = discordThreadUrl[discordThreadUrl.length - 1]
    const proposalTitle = d.properties.Name.title.map(t => {
      return t.plain_text
    }).join(' ');
    const message = new MessageEmbed()
      .setTitle('🌡')
      .addField('Proposal', `[${proposalTitle}](${d.url})`)
    const discordChannel = discord.channels.cache.get(discordThreadId);
    const temperatureCheckPollId = await discordChannel.send({ embeds: [message] }).then(m => {
      m.react('👍')
      m.react('👎')
      return m.id
    })
    
    await notion.pages.update({
      page_id: d.id,
      properties: {
        'Temperature Check': {
          url :`https://discord.com/channels/${config.guildId}/${discordThreadId}/${temperatureCheckPollId}`
        },
        [config.proposalIdProperty]: {
          rich_text: [
            {
              type: "text",
              text: { content: `${config.proposalIdPrefix}${nextProposalId}` }
            }
          ]
        }
      }
    })
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
  checkNotionDb(config.proposalDb.id, config.proposalDb.preDiscussionFilter).then(r=>{
    r.results.forEach((p) => {
      startThread(p).then((url)=> { 
        updateProperty(p.id, 'Discussion Thread', { url: url });
        log(`New proposal to dicsuss: ${p.url}`);
      });
    })
  });
}

//setInterval(handleDiscussions, 1000);
//queueNextGovernanceAction()
//handleDiscussions()
setInterval(temperatureCheckSetup, 1000);
//getNextProposalIdIndex()