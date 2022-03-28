import dotenv from 'dotenv';
dotenv.config();

console.log(`keys environment: ${process.env.NODE_ENV}`);

export const keys = {
  DISCORD_KEY: process.env.NODE_ENV === 'dev' ? process.env.DISCORD_KEY_DEV : process.env.DISCORD_KEY,
  NOTION_KEY: process.env.NOTION_KEY,
  SNAPSHOT_KEY: process.env.SNAPSHOT_KEY
};