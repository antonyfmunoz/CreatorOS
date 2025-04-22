import { db } from '../server/db';
import { users } from '@shared/schema';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';

async function createAntonyfmunozUser() {
  try {
    console.log('Checking for antonyfmunoz user...');
    
    // Check if user "antonyfmunoz" exists and update password
    const existingUser = await db.select().from(users).where(eq(users.username, 'antonyfmunoz'));
    if (existingUser.length > 0) {
      console.log('User "antonyfmunoz" exists, updating password...');
      const hashedPassword = await bcrypt.hash('testpassword', 10);
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.username, 'antonyfmunoz'));
      
      console.log('Updated antonyfmunoz password for ID:', existingUser[0].id);
      console.log('You can now log in with:');
      console.log('Username: antonyfmunoz');
      console.log('Password: testpassword');
      return;
    }
    
    // Create a new user
    console.log('Creating new user antonyfmunoz...');
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    
    const result = await db.insert(users).values({
      username: 'antonyfmunoz',
      password: hashedPassword,
      displayName: 'Antony Munoz',
      bio: null,
      profileImageUrl: null,
      role: 'creator',
      xpPoints: 0,
      level: 1,
      createdAt: new Date()
    }).returning();
    
    console.log('Successfully created user:', {
      ...result[0],
      password: '***REDACTED***'
    });
    
    console.log('You can now log in with:');
    console.log('Username: antonyfmunoz');
    console.log('Password: testpassword');
    
  } catch (error) {
    console.error('Error creating/updating antonyfmunoz user:', error);
  } finally {
    process.exit(0);
  }
}

createAntonyfmunozUser();