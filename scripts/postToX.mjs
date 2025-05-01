#!/usr/bin/env node
import * as dotenv from 'dotenv';

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// X API client imports
import { TwitterApi } from 'twitter-api-v2';

// Configuration
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const COLLECTIONS_PATH = path.join(PROJECT_ROOT, 'src/collections/ducks');
const IMAGES_PATH = path.join(PROJECT_ROOT, 'public/images/ducks');

// X API Configuration
// You can hardcode these for testing, but use environment variables for production
const X_API_KEY = process.env.X_API_KEY || 'YOUR_API_KEY'; // Consumer Key
const X_API_SECRET = process.env.X_API_SECRET || 'YOUR_API_SECRET'; // Consumer Secret
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN'; // Access Token
const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET || 'YOUR_ACCESS_SECRET'; // Access Token Secret
const X_COMMUNITY_ID = process.env.X_COMMUNITY_ID || null; // Optional: The ID of your X community

// Initialize X client
const xClient = new TwitterApi({
  appKey: X_API_KEY,
  appSecret: X_API_SECRET,
  accessToken: X_ACCESS_TOKEN,
  accessSecret: X_ACCESS_SECRET,
});

async function findUnpostedDuck() {
  try {
    // Get all duck JSON files
    const duckFiles = await fs.readdir(COLLECTIONS_PATH);
    
    // Filter for JSON files only and sort by token ID (numeric)
    const jsonFiles = duckFiles
      .filter(file => file.endsWith('.json'))
      .sort((a, b) => {
        // Extract the numeric part from filenames like "[num].json"
        const numA = parseInt(a.replace('.json', ''), 10);
        const numB = parseInt(b.replace('.json', ''), 10);
        return numA - numB;
      });
    
    // Check each duck until finding one that hasn't been posted
    for (const jsonFile of jsonFiles) {
      const filePath = path.join(COLLECTIONS_PATH, jsonFile);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const duckData = JSON.parse(fileContent);
      
      // Check if the duck has been posted to X already
      // We'll add a postedToX field to track this
      if (!duckData.postedToX) {
        // Found an unposted duck
        return {
          data: duckData,
          filePath,
          imagePath: path.join(IMAGES_PATH, `${duckData.tokenId}.webp`)
        };
      }
    }
    
    console.log('All ducks have been posted to X already.');
    return null;
  } catch (error) {
    console.error('Error finding unposted duck:', error);
    throw error;
  }
}

async function postDuckToX(duck) {
  try {
    // First, upload the image
    const imageBuffer = await fs.readFile(duck.imagePath);
    const mediaId = await xClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/webp' });
    
    // Create the post text with the name and backstory
    const postText = `Dead Duck #${duck.data.tokenId}: ${duck.data.gameData.name}\n\n${duck.data.gameData.backstory}`;
    
    // Post to the community if community ID is provided, otherwise post normally
    const tweetOptions = {
        text: postText,
        media: { media_ids: [mediaId] }
      };
      
      // Only add community ID if it's provided
      if (X_COMMUNITY_ID) {
        // X API v2 expects in_reply_to_tweet_id to be a string, not null
        // And super_followers_only is not a valid parameter
        tweetOptions.community_id = X_COMMUNITY_ID;
      }
      
      console.log('Posting with options:', JSON.stringify(tweetOptions));
      const result = await xClient.v2.tweet(tweetOptions);
    
    console.log(`Successfully posted Duck #${duck.data.tokenId} to X!`);
    console.log(`Tweet ID: ${result.data.id}`);
    
    // Update the duck's record to mark it as posted
    duck.data.postedToX = true;
    duck.data.postedToXAt = new Date().toISOString();
    duck.data.tweetId = result.data.id;
    
    // Save the updated duck data
    await fs.writeFile(duck.filePath, JSON.stringify(duck.data, null, 2), 'utf8');
    console.log(`Updated duck record for #${duck.data.tokenId}`);
    
    return result;
  } catch (error) {
    console.error('Error posting duck to X:', error);
    throw error;
  }
}

async function main() {
  try {
    // Check if X API credentials are configured
    if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET || !X_COMMUNITY_ID) {
      console.error('Error: X API credentials are not configured. Please set the required environment variables.');
      process.exit(1);
    }

    console.log('Looking for an unposted duck...');
    const unpostedDuck = await findUnpostedDuck();
    
    if (!unpostedDuck) {
      console.log('No unposted ducks found.');
      process.exit(0);
    }
    
    console.log(`Found unposted Duck #${unpostedDuck.data.tokenId}: ${unpostedDuck.data.gameData.name}`);
    
    // Post the duck to X
    await postDuckToX(unpostedDuck);
    
    console.log('Script completed successfully!');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Execute the main function
main();