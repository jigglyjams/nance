import * as nance from '../nance.js';
import { addDaysToDate } from '../utils.js';

nance.temperatureCheckSetup(addDaysToDate(new Date(), 3))