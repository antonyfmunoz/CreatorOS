import { db } from '../server/db';
import { posts } from '@shared/schema';

async function seedPosts() {
  try {
    console.log('Seeding posts...');
    
    // Get existing users
    const usersResult = await db.query.users.findMany();
    
    if (usersResult.length === 0) {
      console.log('No users found. Please run add-test-user.ts first.');
      return;
    }
    
    // Use antonyfmunoz user if available, otherwise use the first user
    let targetUserId = usersResult.find(user => user.username === 'antonyfmunoz')?.id || usersResult[0].id;
    
    console.log(`Using user ID ${targetUserId} for posts`);
    
    // Create sample posts
    const samplePosts = [
      {
        userId: targetUserId,
        content: "Just released a new video tutorial on React Hooks! Check it out and let me know what you think 🚀",
        mediaType: "text",
        likes: 42,
        comments: 7,
      },
      {
        userId: targetUserId,
        content: "Beautiful sunset today! #nature #photography",
        imageUrl: "https://images.unsplash.com/photo-1503803548695-c2a7b4a5b875?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8c3Vuc2V0fGVufDB8fDB8fA%3D%3D&auto=format&fit=crop&w=500&q=60",
        mediaType: "photo",
        likes: 128,
        comments: 15,
      },
      {
        userId: targetUserId,
        content: "Working on a new project with some amazing collaborators! #coding #webdev",
        mediaType: "text",
        likes: 36,
        comments: 4,
      },
      {
        userId: targetUserId,
        content: "Here's my workspace setup. Dual monitors for the win! #setup #productivity",
        imageUrl: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTB8fGNvbXB1dGVyJTIwc2V0dXB8ZW58MHx8MHx8&auto=format&fit=crop&w=500&q=60",
        mediaType: "photo",
        likes: 89,
        comments: 12,
      },
      {
        userId: targetUserId,
        content: "Just published my first npm package! It's a utility library for handling date formatting in JavaScript. #javascript #npm #opensource",
        mediaType: "text",
        likes: 64,
        comments: 8,
      }
    ];
    
    // Insert the posts
    for (const post of samplePosts) {
      const [result] = await db.insert(posts).values(post).returning();
      console.log(`Created post with ID ${result.id}: ${post.content.substring(0, 30)}...`);
    }
    
    console.log('Successfully seeded posts!');
  } catch (error) {
    console.error('Error seeding posts:', error);
  } finally {
    process.exit(0);
  }
}

seedPosts();