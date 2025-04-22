import { 
  users, type User,
  posts, type Post,
  comments, type Comment
} from "@shared/schema";
import { db } from "./fixed-db";
import { eq, desc } from "drizzle-orm";

export class FixedDatabaseStorage {
  // Get all posts with user data
  async getPosts(): Promise<(Post & { user: User })[]> {
    try {
      console.log("Getting posts from database...");
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
  
  // Get post by ID with user data
  async getPostById(id: number): Promise<(Post & { user: User }) | undefined> {
    try {
      const [result] = await db.select({
        post: posts,
        user: users,
      }).from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.id, id));
      
      if (!result) return undefined;
      
      return { ...result.post, user: result.user };
    } catch (error) {
      console.error(`Error fetching post ${id}:`, error);
      return undefined;
    }
  }
  
  // Get all comments for a post with user data
  async getCommentsByPostId(postId: number): Promise<(Comment & { user: User })[]> {
    try {
      const result = await db.select({
        comment: comments,
        user: users,
      }).from(comments)
        .innerJoin(users, eq(comments.userId, users.id))
        .where(eq(comments.postId, postId))
        .orderBy(desc(comments.createdAt));
      
      return result.map(({ comment, user }) => ({ ...comment, user }));
    } catch (error) {
      console.error(`Error fetching comments for post ${postId}:`, error);
      return [];
    }
  }
}

export const fixedStorage = new FixedDatabaseStorage();