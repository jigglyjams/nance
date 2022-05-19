import { Client as notionClient } from '@notionhq/client';
import { Client as discordClient, Intents, MessageEmbed } from 'discord.js';
import { NotionToMarkdown } from 'notion-to-md';
import fs from 'fs';
import pinataSDK from '@pinata/sdk';
import schedule from 'node-schedule';
import * as notionGrab from './notionGrab.js';
import { createProposal, getProposalVotes } from './snapshot.js';
import { keys, configName } from './keys.js';
import { log, sleep, addDaysToDate, unixTimeStampNow, addDaysToTimeStamp, getLastSlash } from './utils.js';


const config = (await import(`./${configName}`)).config
console.log(`snapshot space ${config.snapshot.space} loaded!`)

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
    log(`${config.name}: issue querying notion db`, 'e');
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

    // if the bot sent the message then edit it with instructions
    // this is neccessary in case someone else created the thread
    if (originalMessage.author.id === discord.user.id) {
      originalMessage.edit(`${originalMessage.content}\n\nTemperature Check poll is now open! **Vote by reacting to this message.**`);
    }
    await Promise.all([
      originalMessage.react(config.poll.voteYesEmoji),
      originalMessage.react(config.poll.voteNoEmoji)
    ]);

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
  log(`${config.name}: temperature check complete.`, 'g');
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

    const resultsMessage = new MessageEmbed()
    
    // send message with who voted
    resultsMessage.setDescription(`Results\n========\n${yesVotes} ${config.poll.voteYesEmoji}'s:\n${yesVoteUsers.join('\n')}\n\n${noVotes} ${config.poll.voteNoEmoji}'s:\n${noVoteUsers.join('\n')}\n`);
    const resultsMessageObj = await discord.channels.cache.get(discordThreadId).send({embeds: [resultsMessage]});

    let statusChange;
    if (pollPassCheck(yesVotes, noVotes)) {
      statusChange = 'Voting'
      resultsMessage.setTitle(`Temperature Check ${config.poll.voteYesEmoji}`);
      const [snapShotUrl, proposalEndTimeStamp] = await votingOffChainSetup(d, config.snapshot.votingTimeDays);
      resultsMessage.addField('Proposal Status', `[Vote here!](${snapShotUrl}) ${config.poll.voteGoVoteEmoji}`);
      resultsMessage.addField('Voting ends', `<t:${proposalEndTimeStamp}>`)
      pollMessage.react(config.poll.voteGoVoteEmoji);
    } else {
      statusChange = 'Cancelled'
      pollMessage.react(config.poll.voteCanceledEmoji);
      resultsMessage.setTitle(`Temperature Check ${config.poll.voteNoEmoji}`);
      resultsMessage.addField('Proposal Status', `canceled ${config.poll.voteCanceledEmoji}`);
    }
    
    notion.pages.update({
      page_id: d.id,
      properties: {
        'Status' : {
          select: { name: `${statusChange}` }
        },
        'Temperature Check': { url: `https://discord.com/channels/${config.guildId}/${discordThreadId}/${resultsMessageObj.id}`}
      }
    });

    // update results message with links and correct results emoji
    resultsMessageObj.edit({ embeds: [resultsMessage] })
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
  return `${text}\n\n---\n[Discussion Thread](${links.discussion}) | [IPFS](${links.ipfs})`
}

export async function votingOffChainSetup(page, votingTimeDays) {
  // convert notion blocks to markdown string
  const mdBlocks = await notionToMd.pageToMarkdown(page.id);
  let mdString = notionToMd.toMarkdownString(mdBlocks);
  
  // append proposal id to beginning of text
  const proposalId = notionGrab.richText(page, config.proposalIdProperty);
  const proposalTitle = `${proposalId} - ${notionGrab.title(page)}`;
  mdString = cleanProposal(mdString);
  const mdStringIpfs = `# ${proposalTitle}${mdString}`

  // write to tmp folder then pin then delete file
  fs.writeFileSync(`./tmp/${page.id}.md`, mdStringIpfs);
  const cid = await pinata.pinFromFS(`./tmp/${page.id}.md`).then(r => {
    fs.rmSync(`./tmp/${page.id}.md`);
    return(r.IpfsHash);
  })
  const ipfsUrl = `${config.ipfsGateway}/${cid}`

  // append links at bottom of text
  const relevantLinks = {
    discussion: page.properties['Discussion Thread'].url,
    ipfs: ipfsUrl,
  }
  mdString = addLinksToProposalMd(mdString, relevantLinks);

  const proposalStartTimeStamp = unixTimeStampNow();
  const proposalEndTimeStamp = addDaysToTimeStamp(proposalStartTimeStamp, votingTimeDays);
  const snapshotVoteId = await createProposal(
    config.snapshot.space,
    {title: proposalTitle, body: mdString},
    config.snapshot.choices,
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
  log(`${config.name}: ${proposalTitle} vote live at ${snapShotUrl}`);
  return [snapShotUrl, proposalEndTimeStamp];
}

export function offChainVotePassCheck(voteResults) {
  const yes = voteResults.votes[config.snapshot.choices[0]];
  const no = voteResults.votes[config.snapshot.choices[1]];
  const ratio = yes/(yes+no);
  if (voteResults.totalVotes >= config.snapshot.quroum && ratio >= config.snapshot.passingRatio) {
    return true;
  } else {
    return false;
  }
}

export async function closeVotingOffChain(){
  const votingProposals = await checkNotionDb(config.proposalDb.id, config.proposalDb.votingFilter);
  for (let i=0; i < votingProposals.results.length; i++) {
    const d = votingProposals.results[i];
    const offChainVotingId = getLastSlash(d.properties['Snapshot'].url);
    const offChainVotingResults = await getProposalVotes(offChainVotingId);

    // check if votes are final
    console.log(offChainVotingResults);
    if (offChainVotingResults.scoresState !== 'final') {
      log(`${config.name}: voting results not final! Re-run closeVotingOffChain()`, 'e');
    }

    const statusUpdate = offChainVotePassCheck(offChainVotingResults) ? 'Approved' : 'Cancelled';
    updateProperty(d.id, 'Status', { 'select': { name: statusUpdate }});
  }
  log(`${config.name}: closeVotingOffChain complete.`, 'g');
}

async function startThread(proposal) {
  // notion api sometimes splits out the title into multiple objects, map into single string separated by ' '
  const proposalTitle = notionGrab.title(proposal);
  const proposalUrl = proposal.url;
  const discordChannel = discord.channels.cache.get(config.channelId);

  // some proposals have multiple categories, map them into a single string separated by ' & '
  const proposalType = notionGrab.categoryText(proposal)

  // if no category dont add it message text
  const text = (proposalType) ? `New **${proposalType}** proposal: ${proposalUrl}` : `New proposal: ${proposalUrl}`;
  const message = await discordChannel.send(text);
  return message.startThread({
    name: proposalTitle,
    autoArchiveDuration: 60*24*7
  }).then(thread => {
    return `https://discord.com/channels/${config.guildId}/${config.channelId}/${thread.id}`;
  });
}

export async function handleDiscussions(){
  checkNotionDb(config.proposalDb.id, config.proposalDb.preDiscussionFilter).then(r=>{
    r.results.forEach((p) => {
      p.url = notionGrab.getPublicUrl(p.url, config.notionPublicUrlPrefix);
      startThread(p).then((url)=> { 
        updateProperty(p.id, 'Discussion Thread', { url: url });
        log(`${config.name}: New proposal to dicsuss: ${p.url}`);
      });
    })
  }).catch(() => {
    log(`${config.name}: handleDiscussions() failed!`, 'e');
  });
}

process.on('SIGINT', function () { 
  schedule.gracefulShutdown().then(() => {
    log('schedule shutdown.', 'g');
    process.exit(0);
  })
})