import * as nance from '../nance.js';
import { Client as notionClient } from '@notionhq/client';
import { keys } from '../keys.js';
const notion = new notionClient({ auth: keys.NOTION_KEY });

nance.votingOffChainSetup(await notion.pages.retrieve({page_id:'e40fae0073db4717b3f40879f2bafa20'}))