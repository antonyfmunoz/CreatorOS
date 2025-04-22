import { db } from './db';
import { posts, users } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

// A standalone function to get posts without requiring the tagged_users table
export async function getSimplePosts() {
  try {
    console.log("Getting posts from database using simple function...");
    
    const result = await db.select({
      post: posts,
      user: users,
    }).from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .orderBy(desc(posts.id));
    
    // Map the results to combine post and user data
    const postsWithUsers = result.map(({ post, user }) => ({ ...post, user }));
    
    console.log(`Found ${postsWithUsers.length} posts in database`);
    return postsWithUsers;
  } catch (error) {
    console.error("Error fetching posts:", error);
    // Return empty array instead of throwing to prevent app from crashing
    return [];
  }
}