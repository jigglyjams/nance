import dotenv from 'dotenv';
dotenv.config();

import snapshot from '@snapshot-labs/snapshot.js';
import { request as gqlRequest, gql } from 'graphql-request';
import { ethers } from 'ethers';

const provider = new ethers.providers.AlchemyProvider('mainnet', process.env.ALCHEMY_KEY);
const wallet = new ethers.Wallet(process.env.NANCE_PK, provider);

const hub = 'https://hub.snapshot.org';
const client = new snapshot.Client712(hub);

export async function createProposal(space, proposal, choices, startTimeStamp, endTimeStamp) {
  const latestBlock = await provider.getBlockNumber();
  const receipt = client.proposal(wallet, wallet.address, {
    space: space,
    type: 'single-choice',
    title: proposal.title,
    body: proposal.body,
    discussion: proposal.discussion,
    choices: choices,
    start: startTimeStamp,
    end: endTimeStamp,
    snapshot: latestBlock,
    network: '1',
    strategies: JSON.stringify({}),
    plugins: JSON.stringify({}),
    metadata: JSON.stringify({})
  }).then((r) => {
    return r.id
  }).catch((e) => {
    console.log(e)
  });
  return receipt;
}

// use graphql to get proposal info
export async function getProposalVotes(proposalId) {
  const query = gql`
  {
    proposal(id:"${proposalId}") {
      choices
      state
      votes
      scores
      scores_state
      scores_total
    }
  }`;

  const gqlResults = (await gqlRequest(`${hub}/graphql`, query)).proposal;

  // results return as: (make this an interface!)
  // { totalVotes: n,
  //   scoresState: '<state>',
  //   votes: {
  //     <choice>: n,
  //     ...
  //     <choice>: n
  //   }
  // }
  let offChainVotingResults = { totalVotes: gqlResults.votes, scoresState: gqlResults.scores_state, votes: {} };
  gqlResults.choices.map((item, index) => {
    offChainVotingResults.votes[item] = gqlResults.scores[index];
  });

  return offChainVotingResults;
}
