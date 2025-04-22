import { db } from '../server/db';
import { users } from '@shared/schema';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';

async function createTestUser() {
  try {
    console.log('Adding new test user to database...');
    
    // Check if user "testuser" exists and update password
    const existingUser1 = await db.select().from(users).where(eq(users.username, 'testuser'));
    if (existingUser1.length > 0) {
      console.log('Test user "testuser" exists, updating password...');
      const hashedPassword = await bcrypt.hash('testpassword', 10);
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.username, 'testuser'));
      
      console.log('Updated testuser password for ID:', existingUser1[0].id);
      console.log('You can now log in with:');
      console.log('Username: testuser');
      console.log('Password: testpassword');
      return;
    }
    
    // Check if testuser2 exists
    const existingUser2 = await db.select().from(users).where(eq(users.username, 'testuser2'));
    if (existingUser2.length > 0) {
      console.log('Test user "testuser2" already exists:', {
        ...existingUser2[0],
        password: '***REDACTED***'
      });
      
      // Let's update the password to a known value
      const hashedPassword = await bcrypt.hash('testpassword', 10);
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.username, 'testuser2'));
      
      console.log('Updated testuser2 password!');
      console.log('You can now log in with:');
      console.log('Username: testuser2');
      console.log('Password: testpassword');
      return;
    }
    
    // Create a new test user
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    
    const result = await db.insert(users).values({
      username: 'testuser2',
      password: hashedPassword,
      displayName: 'Test User 2',
      bio: null,
      profileImageUrl: null,
      role: 'user',
      xpPoints: 0,
      level: 1,
      createdAt: new Date()
    }).returning();
    
    console.log('Successfully created test user:', {
      ...result[0],
      password: '***REDACTED***'
    });
    
    console.log('You can now log in with:');
    console.log('Username: testuser2');
    console.log('Password: testpassword');
    
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    process.exit(0);
  }
}

createTestUser();