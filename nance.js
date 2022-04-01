import { Client as notionClient } from '@notionhq/client';
import { Client as discordClient, Intents, MessageEmbed } from 'discord.js';
import schedule from 'node-schedule';
import { keys } from './keys.js';
import { log, sleep, addDaysToDate } from './utils.js';
import { config } from './config.js';

const notion = new notionClient({ auth: keys.NOTION_KEY })

const discord = new discordClient({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS] });
discord.once('ready', async c => {
  log(`Ready! Logged in as ${c.user.tag}`);
  closeTemperatureCheck()
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
  const calendar = await checkNotionDb(config.governanceScheduleDb.id, config.governanceScheduleDb.filter, config.governanceScheduleDb.sorts)
  const nextEvent = calendar.results[0].properties
  const nextDate = new Date(nextEvent.Date.date.start)
  const endDate = addDaysToDate(nextDate, nextEvent['Number of Days'].number);
  const nextAction = await nextEvent.Tags.multi_select.map(tag => {
    return tag.name
  }).join(', ')
  let action;
  if (nextAction === 'Governance Cycle, Temperature Check'){
    action = schedule.scheduleJob('Temperature Check', nextDate, () => {
      temperatureCheckSetup(endDate);
    })
  } else if (nextAction === 'Governance Cycle, Voting Off-Chain'){
    action = schedule.scheduleJob('Voting Off-Chain', nextDate, () => {
      //votingOffChainSetup();
    })
  } else if (nextAction === 'Governance Cycle, Execution'){
    action = schedule.scheduleJob('Execution', nextDate, () => {
      //votingExecutionSetup();
    })
  }

  try {
    action.on('success', () => {
      queueNextGovernanceAction()
    })
  } catch(e) {
    log('no action to queue, check notion calendar!', 'e')
  }

  log(`${config.name}: ${Object.keys(schedule.scheduledJobs)[0]} to run at ${nextDate}`);
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

async function temperatureCheckSetup(endDate) {
  const currentProposalId = await getProposalIdNum()
  const unixTimeStampEnd = Math.floor(endDate.getTime()/1000)
  let temperatureCheckRollupMessage = `React in the temperature checks before <t:${unixTimeStampEnd}>\n`;
  const discussions = await checkNotionDb(config.proposalDb.id, config.proposalDb.discussionFilter)
  for (let i=0; i< discussions.results.length; i++) {
    const d = discussions.results[i];
    const nextProposalId = currentProposalId + 1 + i
    updateProperty(d.id, 'Status', { select: { name: 'Temperature Check' }})
    const discordThreadUrl = d.properties['Discussion Thread'].url.split('/')
    const discordThreadId = discordThreadUrl[discordThreadUrl.length - 1]
    const proposalTitle = d.properties.Name.title.map(t => {
      return t.plain_text
    }).join(' ');
    const message = new MessageEmbed()
      .setTitle('Temperature Check Poll')
      .addField('Proposal', `[${proposalTitle}](${d.url})`)
    const discordChannel = discord.channels.cache.get(discordThreadId);
    const temperatureCheckPollId = await discordChannel.send({ embeds: [message] }).then(m => {
      m.react(config.poll.voteYesEmoji).then(()=>{
        m.react(config.poll.voteNoEmoji)
      })
      return m.id
    })

    const temperatureCheckUrl = `https://discord.com/channels/${config.guildId}/${discordThreadId}/${temperatureCheckPollId}`
    temperatureCheckRollupMessage += `${i+1}. ${proposalTitle}: ${temperatureCheckUrl}\n\n`

    // have to update both properties at once or there are conflicts
    await notion.pages.update({
      page_id: d.id,
      properties: {
        'Temperature Check': {
          url : temperatureCheckUrl
        },
        [config.proposalIdProperty]: {
          rich_text: [
            {
              type: 'text',
              text: { content: `${config.proposalIdPrefix}${nextProposalId}` }
            }
          ]
        }
      }
    })
  }

  // edit and send roll up temperature check discord message
  temperatureCheckRollupMessage += `<@&${config.alertRole}>`
  const rollup = new MessageEmbed()
    .setTitle('Temperature Checks')
    .setDescription(temperatureCheckRollupMessage)
  discord.channels.cache.get(config.channelId).send({embeds: [rollup]});
  log(`${config.name} temperature check complete.`)
  
}

function pollPassCheck(yes, no) {
  const ratio = no !== 0 ? yes/no : yes;
  if (yes >= config.poll.minYesVotes && ratio >= config.poll.yesNoRatio) {
    return true;
  } else {
    return false;
  }
}

async function closeTemperatureCheck() {
  // get current proposals in temperature check 
  // getting discord reactions on old messages is kinda hard:
  // https://stackoverflow.com/questions/64241315/is-there-a-way-to-get-reactions-on-an-old-message-in-discordjs/64242640#64242640
  const temperatureCheckProposals = await checkNotionDb(config.proposalDb.id, config.proposalDb.temperatureCheckFilter)
  for (let i=0; i < temperatureCheckProposals.results.length; i++) {
    const d = temperatureCheckProposals.results[i]
    const temperatureCheckUrl = d.properties['Temperature Check'].url.split('/')
    const discordThreadId = temperatureCheckUrl[temperatureCheckUrl.length - 2]
    const temperatureCheckPollId = temperatureCheckUrl[temperatureCheckUrl.length - 1]
    const pollMessage = await discord.channels.cache.get(discordThreadId).messages.fetch(temperatureCheckPollId)
    const pollReactionsCollection = await pollMessage.reactions.cache
    const yesVoteUsers = await pollReactionsCollection.get(config.poll.voteYesEmoji).users.fetch().then(results => results.filter(user => !user.bot).map(user => user.tag))
    const noVoteUsers = await pollReactionsCollection.get(config.poll.voteNoEmoji).users.fetch().then(results => results.filter(user => !user.bot).map(user => user.tag))

    const yesVotes = yesVoteUsers.length;
    const noVotes = noVoteUsers.length;

    if (pollPassCheck(yesVotes, noVotes)) {
      discord.channels.cache.get(discordThreadId).send('yes');
    }
  }
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

process.on('SIGINT', function () { 
  schedule.gracefulShutdown().then(() => {
    log('schedule shutdown.', 'g');
    process.exit(0);
  })
})

//setInterval(handleDiscussions, 10*1000);
queueNextGovernanceAction()
//handleDiscussions()
//temperatureCheckSetup()
//getNextProposalIdIndex()