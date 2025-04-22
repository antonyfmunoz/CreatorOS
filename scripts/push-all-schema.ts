import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import * as schema from '@shared/schema';

async function pushAllSchema() {
  try {
    console.log('Pushing all schema tables to database...');
    
    // Generate and run the SQL for each table
    const tables = [
      'users',
      'posts',
      'savedPosts',
      'comments',
      'products',
      'aiAgents',
      'aiChats',
      'communities',
      'channels',
      'channelMessages',
      'followers',
      'revenue',
      'contacts',
      'documents',
      'stories',
      'notifications',
      'conversations',
      'conversationParticipants',
      'directMessages',
      'taggedUsers'
    ];
    
    // Use drizzle-kit to push all tables
    const pushCommand = 'npx drizzle-kit push:pg --schema=./shared/schema.ts';
    const { exec } = require('child_process');
    
    exec(pushCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing drizzle-kit push: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`drizzle-kit stderr: ${stderr}`);
        return;
      }
      console.log(`drizzle-kit stdout: ${stdout}`);
      console.log('All schema tables pushed successfully!');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error pushing schema:', error);
    process.exit(1);
  }
}

pushAllSchema();