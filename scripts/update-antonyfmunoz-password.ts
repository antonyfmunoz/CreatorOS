import { db } from '../server/db';
import { users } from '@shared/schema';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';

async function updateAntonyfmunozPassword() {
  try {
    console.log('Updating antonyfmunoz password to Password123...');
    
    // Check if user "antonyfmunoz" exists
    const existingUser = await db.select().from(users).where(eq(users.username, 'antonyfmunoz'));
    if (existingUser.length > 0) {
      console.log('User "antonyfmunoz" exists, updating password...');
      const hashedPassword = await bcrypt.hash('Password123', 10);
      await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.username, 'antonyfmunoz'));
      
      console.log('Updated antonyfmunoz password for ID:', existingUser[0].id);
      console.log('You can now log in with:');
      console.log('Username: antonyfmunoz');
      console.log('Password: Password123');
      return;
    } else {
      console.log('User antonyfmunoz not found. Please run add-antonyfmunoz-user.ts first.');
    }
  } catch (error) {
    console.error('Error updating antonyfmunoz password:', error);
  } finally {
    process.exit(0);
  }
}

updateAntonyfmunozPassword();