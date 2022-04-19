import * as nance from '../nance.js';
import { sleep } from '../utils.js';

await sleep(2000)
setInterval(nance.handleDiscussions, 10*1000);