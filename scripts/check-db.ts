import { db } from '../server/db';
import { users } from '@shared/schema';

async function checkDatabase() {
  try {
    console.log('Checking database connection...');
    
    // List all tables in the database
    console.log('Listing tables in database:');
    const tableResults = await db.execute(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    console.log('Tables:', tableResults.rows);
    
    // Check users table specifically
    console.log('\nListing all users in database:');
    const allUsers = await db.select().from(users);
    console.log('Total user count:', allUsers.length);
    
    if (allUsers.length > 0) {
      console.log('First user:', {
        ...allUsers[0],
        password: '***REDACTED***'
      });
    } else {
      console.log('No users found in database.');
    }
    
    // Look for the test user
    console.log('\nLooking for "testuser" in database:');
    const testUser = await db.select().from(users).where(users.username === 'testuser');
    if (testUser.length > 0) {
      console.log('Found test user:', {
        ...testUser[0],
        password: '***REDACTED***'
      });
    } else {
      console.log('Test user not found in the database.');
    }
    
    console.log('\nDatabase check complete!');
    
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    process.exit(0);
  }
}

checkDatabase();