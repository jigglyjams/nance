import dotenv from 'dotenv';
dotenv.config();

import snapshot from '@snapshot-labs/snapshot.js';
import { ethers } from 'ethers';

const provider = new ethers.providers.AlchemyProvider('mainnet', process.env.ALCHEMY_KEY);
const wallet = new ethers.Wallet(process.env.NANCE_PK, provider);

const hub = 'https://hub.snapshot.org';
const client = new snapshot.Client712(hub);

export async function createProposal(space, proposal, startTimeStamp, endTimeStamp) {
  const latestBlock = await provider.getBlockNumber();
  const receipt = client.proposal(wallet, wallet.address, {
    space: space,
    type: 'single-choice',
    title: proposal.title,
    body: proposal.body,
    discussion: proposal.discussion,
    choices: ['For', 'Against', 'Abstain'],
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
