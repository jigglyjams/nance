import * as nance from '../nance.js';
import { addDaysToDate, sleep } from '../utils.js';

await sleep(1000);
nance.temperatureCheckSetup(addDaysToDate(new Date(), 3))