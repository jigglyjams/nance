import * as nance from '../nance.js';
import { Client as notionClient } from '@notionhq/client';
import { keys } from '../keys.js';
const notion = new notionClient({ auth: keys.NOTION_KEY });

nance.votingOffChainSetup(await notion.pages.retrieve({page_id:'e70e20b00ae94e8a8fb71a2a4f22447c'}))