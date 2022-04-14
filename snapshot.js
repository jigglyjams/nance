import dotenv from 'dotenv';
dotenv.config();

import snapshot from '@snapshot-labs/snapshot.js';
import { ethers } from 'ethers';

const provider = new ethers.providers.AlchemyProvider('mainnet', process.env.ALCHEMY_KEY);
const wallet = new ethers.Wallet(process.env.NANCE_PK, provider);

const hub = 'https://hub.snapshot.org';
const client = new snapshot.Client712(hub);

export async function createProposal(proposal, startTimeStamp, endTimeStamp) {
  const latestBlock = await provider.getBlockNumber();
  const receipt = client.proposal(wallet, wallet.address, {
    space: 'jigglyjams.eth',
    type: 'single-choice',
    title: proposal.title,
    body: proposal.body,
    discussion: 'https://www.notion.so/Deploy-V2-9811e82062e24d9fbf7a7523d32b9b8e',
    choices: ['Yes', 'No', 'Abstain'],
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
