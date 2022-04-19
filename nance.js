import { Client as notionClient } from '@notionhq/client';
import { Client as discordClient, Intents, MessageEmbed } from 'discord.js';
import { NotionToMarkdown } from 'notion-to-md';
import fs from 'fs';
import pinataSDK from '@pinata/sdk';
import schedule from 'node-schedule';
import * as notionGrab from './notionGrab.js';
import { createProposal } from './snapshot.js';
import { keys } from './keys.js';
import { log, sleep, addDaysToDate, unixTimeStampNow, addDaysToTimeStamp } from './utils.js';
import { config } from './config.js';

const notion = new notionClient({ auth: keys.NOTION_KEY });
const notionToMd = new NotionToMarkdown({ notionClient: notion });

const pinata = pinataSDK(keys.PINATA_KEY.KEY, keys.PINATA_KEY.SECRET);
pinata.testAuthentication().then( r => {
  log(`pinataSDK auth: ${r.authenticated}`, 'g');
}).catch(() => {
  log(`pinataSDK auth: failed`, 'e');
})

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
  try {
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
        closeTemperatureCheck()
        //votingOffChainSetup();
      })
    } else if (nextAction === 'Governance Cycle, Execution'){
      action = schedule.scheduleJob('Execution', nextDate, () => {
        //votingExecutionSetup();
      })
    }
    action.on('success', () => {
      queueNextGovernanceAction()
    })
    log(`${config.name}: ${Object.keys(schedule.scheduledJobs)[0]} to run at ${nextDate}`);
  } catch(e) {
    log(`${config.name}: no action to queue, check notion calendar!`, 'e')
  }
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
    return parseInt(notionGrab.richText(p, config.proposalIdProperty).split(config.proposalIdPrefix)[1])
  }).sort((a,b) => { return b - a });
  return sortedProposalIds[0];
}

export async function temperatureCheckSetup(endDate) {
  const currentProposalId = await getProposalIdNum()
  const unixTimeStampEnd = Math.floor(endDate.getTime()/1000)
  let temperatureCheckRollupMessage = `React in the temperature checks before <t:${unixTimeStampEnd}>\n`;
  const discussions = await checkNotionDb(config.proposalDb.id, config.proposalDb.discussionFilter)
  for (let i=0; i< discussions.results.length; i++) {
    const d = discussions.results[i];
    const nextProposalId = currentProposalId + 1 + i;
    const discordThreadUrl = d.properties['Discussion Thread'].url.split('/');
    const discordThreadId = discordThreadUrl[discordThreadUrl.length - 1];
    const proposalTitle = notionGrab.title(d);
    const discordChannel = discord.channels.cache.get(config.channelId);
    const originalMessage = await discordChannel.messages.fetch(discordThreadId);
    originalMessage.edit(`${originalMessage.content}\n\n Temperature Check poll is now open! Vote by reacting to this message.`);
    await Promise.all([
      originalMessage.react(config.poll.voteYesEmoji),
      originalMessage.react(config.poll.voteNoEmoji)
    ]);

    const temperatureCheckPollId = 1;
    const temperatureCheckUrl = `https://discord.com/channels/${config.guildId}/${discordThreadId}`
    temperatureCheckRollupMessage += `${i+1}. ${proposalTitle}: ${temperatureCheckUrl}\n\n`

    // have to update both properties at once or there are conflicts
    await notion.pages.update({
      page_id: d.id,
      properties: {
        'Status': {
          select : { name: 'Temperature Check' }
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
  temperatureCheckRollupMessage += `<@&${config.alertRole}>`;
  const rollup = new MessageEmbed()
    .setTitle('Temperature Checks')
    .setDescription(temperatureCheckRollupMessage);
  discord.channels.cache.get(config.channelId).send({embeds: [rollup]});
  log(`${config.name} temperature check complete.`);
}

function pollPassCheck(yes, no) {
  const ratio = yes/(yes+no)
  if (yes >= config.poll.minYesVotes && ratio >= config.poll.yesNoRatio) {
    return true;
  } else {
    return false;
  }
}

export async function closeTemperatureCheck() {
  // get current proposals in temperature check 
  // getting discord reactions on old messages is kinda hard:
  // https://stackoverflow.com/questions/64241315/is-there-a-way-to-get-reactions-on-an-old-message-in-discordjs/64242640#64242640
  const temperatureCheckProposals = await checkNotionDb(config.proposalDb.id, config.proposalDb.temperatureCheckFilter)
  for (let i=0; i < temperatureCheckProposals.results.length; i++) {
    const d = temperatureCheckProposals.results[i]
    const discordThreadUrl = d.properties['Discussion Thread'].url.split('/')
    const discordThreadId = discordThreadUrl[discordThreadUrl.length - 1]
    const pollMessage = await discord.channels.cache.get(config.channelId).messages.fetch(discordThreadId);
    const pollReactionsCollection = await pollMessage.reactions.cache;
    const yesVoteUsers = await pollReactionsCollection.get(config.poll.voteYesEmoji).users.fetch().then(results => results.filter(user => !user.bot).map(user => user.tag))
    const noVoteUsers = await pollReactionsCollection.get(config.poll.voteNoEmoji).users.fetch().then(results => results.filter(user => !user.bot).map(user => user.tag))

    const yesVotes = yesVoteUsers.length;
    const noVotes = noVoteUsers.length;

    const results = new MessageEmbed()
    if (pollPassCheck(yesVotes, noVotes)) {
      updateProperty(d.id, 'Status', { select: { name: 'Voting' }});
      results.setTitle(`Temperature Check ${config.poll.voteYesEmoji}`);
      votingOffChainSetup(d);
    } else {
      updateProperty(d.id, 'Status', { select: { name: 'Cancelled' }});
      results.setTitle(`Temperature Check ${config.poll.voteNoEmoji}`);
    }

    // send message with who voted
    results.setDescription(`Results\n========\n${yesVotes} ${config.poll.voteYesEmoji}'s:\n${yesVoteUsers.join('\n')}\n\n${noVotes} ${config.poll.voteNoEmoji}'s:\n${noVoteUsers.join('\n')}`);
    discord.channels.cache.get(discordThreadId).send({embeds: [results]});
  }
}

function cleanProposal(text) {
  const textToRemove = '[_How to fill out this template_](/3d81e6bb330a4c869bddd0d6449ac032)_._\n'
  if (text.indexOf(textToRemove) > -1) {
    return text.replace(textToRemove, '');
  } else {
    return `\n ${text}`;
  }
}

function addLinksToProposalMd(text, links) {
  return `${text}\n\n---\n[Discussion Thread](${links.discussion}) | [Temperature Check](${links.temperatureCheck}) | [IPFS](${links.ipfs})`
}

export async function votingOffChainSetup(page) {
  // convert notion blocks to markdown string
  const mdBlocks = await notionToMd.pageToMarkdown(page.id);
  let mdString = notionToMd.toMarkdownString(mdBlocks);
  
  // append proposal id to beginning of text
  const proposalTitle = notionGrab.title(page);
  const proposalId = notionGrab.richText(page, config.proposalIdProperty);
  mdString = cleanProposal(mdString);
  mdString = `# ${proposalId} - ${proposalTitle}${mdString}`

  // write to tmp folder then pin then delete file
  fs.writeFileSync(`./tmp/${page.id}.md`, mdString);
  const cid = await pinata.pinFromFS(`./tmp/${page.id}.md`).then(r => {
    fs.rmSync(`./tmp/${page.id}.md`);
    return(r.IpfsHash);
  })
  const ipfsUrl = `${config.ipfsGateway}/${cid}`

  // append links at bottom of text
  const relevantLinks = {
    discussion: page.properties['Discussion Thread'].url,
    temperatureCheck: page.properties['Temperature Check'].url,
    ipfs: ipfsUrl,
  }
  mdString = addLinksToProposalMd(mdString, relevantLinks);

  const proposalStartTimeStamp = unixTimeStampNow();
  const proposalEndTimeStamp = addDaysToTimeStamp(proposalStartTimeStamp, 4)
  const snapshotVoteId = await createProposal(
    config.snapshot.space,
    {title: proposalTitle, body: mdString},
    proposalStartTimeStamp,
    proposalEndTimeStamp
  );
  const snapShotUrl = `${config.snapshot.base}/${config.snapshot.space}/proposal/${snapshotVoteId}`;

  // update notion db with ipfs and snapshot links
  await notion.pages.update({
    page_id: page.id,
    properties: {
      'IPFS': {
        url : ipfsUrl
      },
      'Snapshot': {
        url: snapShotUrl
      }
    }
  });
  log(`${config.name}: ${proposalId} - ${proposalTitle} vote live at ${snapShotUrl}`);
}

async function startThread(proposal) {
  // notion api sometimes splits out the title into multiple objects, map into single string separated by ' '
  const proposalTitle = notionGrab.title(proposal);
  const proposalUrl = proposal.url;
  const discordChannel = discord.channels.cache.get(config.channelId);

  // some proposals have multiple categories, map them into a single string separated by ' & '
  const proposalType = notionGrab.categoryText(proposal)
  
  const message = await discordChannel.send(`New **${proposalType}** proposal: ${proposalUrl}`);
  return message.startThread({
    name: proposalTitle,
    autoArchiveDuration: 60*24
  }).then(thread => {
    return `https://discord.com/channels/${config.guildId}/${config.channelId}/${thread.id}`;
  });
}

export async function handleDiscussions(){
  checkNotionDb(config.proposalDb.id, config.proposalDb.preDiscussionFilter).then(r=>{
    r.results.forEach((p) => {
      startThread(p).then((url)=> { 
        updateProperty(p.id, 'Discussion Thread', { url: url });
        log(`${config.name}: New proposal to dicsuss: ${p.url}`);
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