export const sleep = (milliseconds) => {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export function log(text, type='l') {
  if (type === 'l') { 
    console.log(`${new Date().toISOString()}\t${text}`);
  } else if (type === 'e') {
    console.log('\x1b[31m%s\x1b[0m',`${new Date().toISOString()}\t${text}`);
  } else if (type === 'g') {
    console.log('\x1b[32m%s\x1b[0m',`${new Date().toISOString()}\t${text}`);
  }
}

export function addDaysToDate(date, days) {
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000))
}

export function unixTimeStampNow() {
  return Math.floor(Date.now() / 1000);
}

export function addDaysToTimeStamp(timestamp, days) {
  return timestamp + (days * 24 * 60 * 60)
}

export function getLastSlash(url) {
  const split = url.split('/');
  return split[split.length - 1];
}