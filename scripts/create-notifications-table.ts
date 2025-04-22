import { db } from '../server/db';
import { notifications } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function createNotificationsTable() {
  try {
    console.log('Creating notifications table...');
    
    // Generate SQL to create the notifications table
    const createTableSQL = sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        link_to TEXT,
        related_user_id INTEGER REFERENCES users(id),
        related_user_image TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    
    // Execute the SQL
    await db.execute(createTableSQL);
    
    console.log('Notifications table created successfully!');
  } catch (error) {
    console.error('Error creating notifications table:', error);
  } finally {
    process.exit(0);
  }
}

createNotificationsTable();