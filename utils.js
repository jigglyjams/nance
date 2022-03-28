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