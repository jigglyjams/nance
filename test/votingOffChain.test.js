import * as nance from '../nance.js';
import { Client as notionClient } from '@notionhq/client';
import { keys } from '../keys.js';
const notion = new notionClient({ auth: keys.NOTION_KEY });

nance.votingOffChainSetup(await notion.pages.retrieve({page_id:'73f3d47272d545c195180aaabbce3e88'}))