import { db } from '../server/db';
import postgres from "postgres";
import { stories } from '../shared/schema';

async function seedStories() {
  console.log('Seeding stories...');
  
  // Create a separate connection for the migration script
  const connectionString = process.env.DATABASE_URL;
  const client = postgres(connectionString as string);
  
  try {
    // Add some sample stories
    await db.insert(stories).values([
      {
        userId: 6, // johndoe
        mediaUrl: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868',
        mediaType: 'image',
        caption: 'Working on a new course today!',
        viewCount: 32
      },
      {
        userId: 7, // sarahmitchell
        mediaUrl: 'https://images.unsplash.com/photo-1540331547168-8b63109225b7',
        mediaType: 'image',
        caption: 'Marketing tip: always know your audience',
        viewCount: 45
      },
      {
        userId: 8, // davidkim
        mediaUrl: 'https://images.unsplash.com/photo-1510915228340-29c85a43dcfe',
        mediaType: 'image',
        caption: 'Coding all day! #webdev',
        viewCount: 18
      },
      {
        userId: 9, // emmathompson
        mediaUrl: 'https://images.unsplash.com/photo-1523726491678-bf852e717f6a',
        mediaType: 'image',
        caption: 'UX design inspiration',
        viewCount: 27
      },
      {
        userId: 10, // alexrodriguez
        mediaUrl: 'https://images.unsplash.com/photo-1605648916361-9bc12ad6a569',
        mediaType: 'image',
        caption: 'Marketing strategies for 2025',
        viewCount: 39
      }
    ]);
    
    console.log('Successfully seeded stories!');
  } catch (error) {
    console.error('Error seeding stories:', error);
  } finally {
    await client.end();
  }
}

seedStories();