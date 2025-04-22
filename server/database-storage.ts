import { 
  users, type User, type InsertUser,
  posts, type Post, type InsertPost,
  comments, type Comment, type InsertComment,
  followers, type InsertFollower,
  savedPosts, type InsertSavedPost,
  stories, type Story, type InsertStory,
  notifications, type Notification, type InsertNotification,
  taggedUsers, type TaggedUser, type InsertTaggedUser
} from "@shared/schema";
import { db } from "./fixed-db";
import { eq, desc, inArray, or, and, sql, not, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./fixed-db";
import { Json } from "drizzle-orm/pg-core";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  updateUser(id: number, updateData: Partial<User>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  followUser(followerId: number, followingId: number): Promise<void>;
  unfollowUser(followerId: number, followingId: number): Promise<void>;
  isFollowing(followerId: number, followingId: number): Promise<boolean>;
  getFollowers(userId: number): Promise<User[]>;
  getFollowing(userId: number): Promise<User[]>;
  searchUsers(query: string): Promise<User[]>;
  
  // Post operations
  getPosts(): Promise<(Post & { user: User })[]>;
  getPostById(id: number): Promise<(Post & { user: User }) | undefined>;
  getPostsByUserId(userId: number): Promise<(Post & { user: User })[]>;
  createPost(insertPost: InsertPost): Promise<Post>;
  likePost(id: number): Promise<Post>;
  unlikePost(id: number): Promise<Post>;
  updatePost(id: number, content: string, imageUrl?: string): Promise<Post>;
  deletePost(id: number): Promise<void>;
  savePost(userId: number, postId: number): Promise<void>;
  unsavePost(userId: number, postId: number): Promise<void>;
  getSavedPosts(userId: number): Promise<(Post & { user: User })[]>;
  
  // Comment operations
  getCommentsByPostId(postId: number): Promise<(Comment & { user: User })[]>;
  createComment(insertComment: InsertComment): Promise<Comment>;
  updateComment(id: number, content: string): Promise<Comment>;
  deleteComment(id: number): Promise<void>;
  likeComment(id: number): Promise<Comment>;
  unlikeComment(id: number): Promise<Comment>;
  
  // Story operations
  getStories(): Promise<(Story & { user: User })[]>;
  getUserStories(userId: number): Promise<Story[]>;
  getStoryById(id: number): Promise<Story | undefined>;
  createStory(insertStory: InsertStory): Promise<Story>;
  deleteStory(id: number): Promise<void>;
  incrementStoryViewCount(id: number): Promise<Story>;
  
  // Notification operations
  getNotificationsByUserId(userId: number): Promise<Notification[]>;
  createNotification(insertNotification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<void>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  deleteNotification(id: number): Promise<void>;
  deleteAllNotifications(userId: number): Promise<void>;
  
  // Session store for authentication
  sessionStore: session.SessionStore;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.SessionStore;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }
  
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error(`Error getting user ${id}:`, error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      console.error(`Error getting user by username ${username}:`, error);
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db.insert(users).values(insertUser).returning();
      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async updateUser(id: number, updateData: Partial<User>): Promise<User> {
    try {
      const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
      return user;
    } catch (error) {
      console.error(`Error updating user ${id}:`, error);
      throw error;
    }
  }

  async deleteUser(id: number): Promise<void> {
    try {
      await db.delete(users).where(eq(users.id, id));
    } catch (error) {
      console.error(`Error deleting user ${id}:`, error);
      throw error;
    }
  }
  
  async followUser(followerId: number, followingId: number): Promise<void> {
    try {
      // Check if already following
      const [existing] = await db
        .select()
        .from(followers)
        .where(
          and(
            eq(followers.followerId, followerId),
            eq(followers.followingId, followingId)
          )
        );
      
      if (existing) return; // Already following
      
      await db.insert(followers).values({
        followerId,
        followingId,
      });
    } catch (error) {
      console.error(`Error following user ${followingId}:`, error);
      throw error;
    }
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    try {
      await db
        .delete(followers)
        .where(
          and(
            eq(followers.followerId, followerId),
            eq(followers.followingId, followingId)
          )
        );
    } catch (error) {
      console.error(`Error unfollowing user ${followingId}:`, error);
      throw error;
    }
  }

  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    try {
      const [result] = await db
        .select()
        .from(followers)
        .where(
          and(
            eq(followers.followerId, followerId),
            eq(followers.followingId, followingId)
          )
        );
      
      return !!result;
    } catch (error) {
      console.error(`Error checking if user ${followerId} is following ${followingId}:`, error);
      return false;
    }
  }
  
  async getFollowers(userId: number): Promise<User[]> {
    try {
      const result = await db
        .select({ user: users })
        .from(followers)
        .innerJoin(users, eq(followers.followerId, users.id))
        .where(eq(followers.followingId, userId));
      
      return result.map(r => r.user);
    } catch (error) {
      console.error(`Error getting followers for user ${userId}:`, error);
      return [];
    }
  }
  
  async getFollowing(userId: number): Promise<User[]> {
    try {
      const result = await db
        .select({ user: users })
        .from(followers)
        .innerJoin(users, eq(followers.followingId, users.id))
        .where(eq(followers.followerId, userId));
      
      return result.map(r => r.user);
    } catch (error) {
      console.error(`Error getting following for user ${userId}:`, error);
      return [];
    }
  }
  
  async searchUsers(query: string): Promise<User[]> {
    try {
      if (!query || query.trim() === '') return [];
      
      const queryLower = `%${query.toLowerCase()}%`;
      
      const result = await db
        .select()
        .from(users)
        .where(
          or(
            sql`LOWER(${users.username}) LIKE ${queryLower}`,
            sql`LOWER(${users.displayName}) LIKE ${queryLower}`
          )
        )
        .limit(10);
      
      return result;
    } catch (error) {
      console.error(`Error searching users with query ${query}:`, error);
      return [];
    }
  }

  // Post operations
  async getPosts(): Promise<(Post & { user: User })[]> {
    try {
      console.log("Getting posts from database...");
      const result = await db.select({
        post: posts,
        user: users,
      }).from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .orderBy(desc(posts.id));
      
      const postsWithUsers = result.map(({ post, user }) => ({ ...post, user }));
      console.log(`Found ${postsWithUsers.length} posts in database`);
      return postsWithUsers;
    } catch (error) {
      console.error("Error fetching posts:", error);
      return [];
    }
  }

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
  
  async getPostsByUserId(userId: number): Promise<(Post & { user: User })[]> {
    try {
      const result = await db.select({
        post: posts,
        user: users,
      }).from(posts)
        .innerJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.userId, userId))
        .orderBy(desc(posts.id));
      
      return result.map(({ post, user }) => ({ ...post, user }));
    } catch (error) {
      console.error(`Error fetching posts for user ${userId}:`, error);
      return [];
    }
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    try {
      const [post] = await db.insert(posts).values(insertPost).returning();
      return post;
    } catch (error) {
      console.error("Error creating post:", error);
      throw error;
    }
  }

  async likePost(id: number): Promise<Post> {
    try {
      const [post] = await db.select().from(posts).where(eq(posts.id, id));
      if (!post) throw new Error(`Post with id ${id} not found`);
      
      const [updatedPost] = await db
        .update(posts)
        .set({ likes: post.likes + 1 })
        .where(eq(posts.id, id))
        .returning();
      
      return updatedPost;
    } catch (error) {
      console.error(`Error liking post ${id}:`, error);
      throw error;
    }
  }

  async unlikePost(id: number): Promise<Post> {
    try {
      const [post] = await db.select().from(posts).where(eq(posts.id, id));
      if (!post) throw new Error(`Post with id ${id} not found`);
      
      // Prevent negative likes
      const newLikes = Math.max(0, post.likes - 1);
      
      const [updatedPost] = await db
        .update(posts)
        .set({ likes: newLikes })
        .where(eq(posts.id, id))
        .returning();
      
      return updatedPost;
    } catch (error) {
      console.error(`Error unliking post ${id}:`, error);
      throw error;
    }
  }
  
  async updatePost(id: number, content: string, imageUrl?: string): Promise<Post> {
    try {
      const [post] = await db.select().from(posts).where(eq(posts.id, id));
      if (!post) throw new Error(`Post with id ${id} not found`);
      
      const updateData: Partial<Post> = { content };
      if (imageUrl !== undefined) {
        updateData.imageUrl = imageUrl;
      }
      
      const [updatedPost] = await db
        .update(posts)
        .set(updateData)
        .where(eq(posts.id, id))
        .returning();
      
      return updatedPost;
    } catch (error) {
      console.error(`Error updating post ${id}:`, error);
      throw error;
    }
  }
  
  async deletePost(id: number): Promise<void> {
    try {
      const [post] = await db.select().from(posts).where(eq(posts.id, id));
      if (!post) throw new Error(`Post with id ${id} not found`);
      
      // Delete any stories associated with this post
      try {
        if (post.userId && post.mediaType) {
          const mediaUrl = post.mediaType === 'photo' ? post.imageUrl : 
                          post.mediaType === 'video' ? post.videoUrl :
                          post.mediaType === 'audio' ? post.audioUrl : null;
          
          if (mediaUrl) {
            await db.delete(stories)
              .where(
                and(
                  eq(stories.userId, post.userId),
                  eq(stories.mediaUrl, mediaUrl)
                )
              );
          }
        }
      } catch (storyError) {
        console.error("Error deleting related stories:", storyError);
      }
      
      // Delete the post (cascade will handle comments deletion due to foreign key constraint)
      await db.delete(posts).where(eq(posts.id, id));
    } catch (error) {
      console.error(`Error deleting post ${id}:`, error);
      throw error;
    }
  }
  
  async savePost(userId: number, postId: number): Promise<void> {
    try {
      // Check if post exists
      const [post] = await db.select().from(posts).where(eq(posts.id, postId));
      if (!post) throw new Error(`Post with id ${postId} not found`);
      
      // Check if user exists
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error(`User with id ${userId} not found`);
      
      // Check if this post is already saved by this user
      const [existingSave] = await db
        .select()
        .from(savedPosts)
        .where(
          and(
            eq(savedPosts.userId, userId),
            eq(savedPosts.postId, postId)
          )
        );
      
      // If not already saved, save it
      if (!existingSave) {
        await db.insert(savedPosts).values({
          userId,
          postId,
        });
      }
    } catch (error) {
      console.error(`Error saving post ${postId} for user ${userId}:`, error);
      throw error;
    }
  }
  
  async unsavePost(userId: number, postId: number): Promise<void> {
    try {
      await db
        .delete(savedPosts)
        .where(
          and(
            eq(savedPosts.userId, userId),
            eq(savedPosts.postId, postId)
          )
        );
    } catch (error) {
      console.error(`Error unsaving post ${postId} for user ${userId}:`, error);
      throw error;
    }
  }
  
  async getSavedPosts(userId: number): Promise<(Post & { user: User })[]> {
    try {
      const result = await db
        .select({
          post: posts,
          user: users,
        })
        .from(savedPosts)
        .innerJoin(posts, eq(savedPosts.postId, posts.id))
        .innerJoin(users, eq(posts.userId, users.id))
        .where(eq(savedPosts.userId, userId))
        .orderBy(desc(posts.id));
      
      return result.map(({ post, user }) => ({ ...post, user }));
    } catch (error) {
      console.error(`Error fetching saved posts for user ${userId}:`, error);
      return [];
    }
  }

  // Comment operations
  async getCommentsByPostId(postId: number): Promise<(Comment & { user: User })[]> {
    try {
      const result = await db
        .select({
          comment: comments,
          user: users,
        })
        .from(comments)
        .innerJoin(users, eq(comments.userId, users.id))
        .where(eq(comments.postId, postId))
        .orderBy(desc(comments.id));
      
      return result.map(({ comment, user }) => ({ ...comment, user }));
    } catch (error) {
      console.error(`Error fetching comments for post ${postId}:`, error);
      return [];
    }
  }
  
  async createComment(insertComment: InsertComment): Promise<Comment> {
    try {
      const [comment] = await db.insert(comments).values(insertComment).returning();
      
      // Increment comment count on the post
      const [post] = await db.select().from(posts).where(eq(posts.id, comment.postId));
      if (post) {
        await db
          .update(posts)
          .set({ comments: post.comments + 1 })
          .where(eq(posts.id, comment.postId));
      }
      
      return comment;
    } catch (error) {
      console.error(`Error creating comment:`, error);
      throw error;
    }
  }
  
  async updateComment(id: number, content: string): Promise<Comment> {
    try {
      const [updatedComment] = await db
        .update(comments)
        .set({ content })
        .where(eq(comments.id, id))
        .returning();
      
      if (!updatedComment) throw new Error(`Comment with id ${id} not found`);
      return updatedComment;
    } catch (error) {
      console.error(`Error updating comment ${id}:`, error);
      throw error;
    }
  }
  
  async deleteComment(id: number): Promise<void> {
    try {
      const [comment] = await db.select().from(comments).where(eq(comments.id, id));
      if (!comment) throw new Error(`Comment with id ${id} not found`);
      
      // Decrement comment count on the post
      const [post] = await db.select().from(posts).where(eq(posts.id, comment.postId));
      if (post) {
        await db
          .update(posts)
          .set({ comments: Math.max(0, post.comments - 1) })
          .where(eq(posts.id, comment.postId));
      }
      
      await db.delete(comments).where(eq(comments.id, id));
    } catch (error) {
      console.error(`Error deleting comment ${id}:`, error);
      throw error;
    }
  }
  
  async likeComment(id: number): Promise<Comment> {
    try {
      const [comment] = await db.select().from(comments).where(eq(comments.id, id));
      if (!comment) throw new Error(`Comment with id ${id} not found`);
      
      const [updatedComment] = await db
        .update(comments)
        .set({ likes: comment.likes + 1 })
        .where(eq(comments.id, id))
        .returning();
      
      return updatedComment;
    } catch (error) {
      console.error(`Error liking comment ${id}:`, error);
      throw error;
    }
  }
  
  async unlikeComment(id: number): Promise<Comment> {
    try {
      const [comment] = await db.select().from(comments).where(eq(comments.id, id));
      if (!comment) throw new Error(`Comment with id ${id} not found`);
      
      // Prevent negative likes
      const newLikes = Math.max(0, comment.likes - 1);
      
      const [updatedComment] = await db
        .update(comments)
        .set({ likes: newLikes })
        .where(eq(comments.id, id))
        .returning();
      
      return updatedComment;
    } catch (error) {
      console.error(`Error unliking comment ${id}:`, error);
      throw error;
    }
  }
  
  // Story operations
  async getStories(): Promise<(Story & { user: User })[]> {
    try {
      const result = await db
        .select({
          story: stories,
          user: users,
        })
        .from(stories)
        .innerJoin(users, eq(stories.userId, users.id))
        .orderBy(desc(stories.id));
      
      return result.map(({ story, user }) => ({ ...story, user }));
    } catch (error) {
      console.error("Error fetching stories:", error);
      return [];
    }
  }
  
  async getUserStories(userId: number): Promise<Story[]> {
    try {
      return await db
        .select()
        .from(stories)
        .where(eq(stories.userId, userId))
        .orderBy(desc(stories.id));
    } catch (error) {
      console.error(`Error fetching stories for user ${userId}:`, error);
      return [];
    }
  }
  
  async getStoryById(id: number): Promise<Story | undefined> {
    try {
      const [story] = await db
        .select()
        .from(stories)
        .where(eq(stories.id, id));
      
      return story;
    } catch (error) {
      console.error(`Error fetching story ${id}:`, error);
      return undefined;
    }
  }
  
  async createStory(insertStory: InsertStory): Promise<Story> {
    try {
      const [story] = await db
        .insert(stories)
        .values(insertStory)
        .returning();
      
      return story;
    } catch (error) {
      console.error("Error creating story:", error);
      throw error;
    }
  }
  
  async deleteStory(id: number): Promise<void> {
    try {
      await db.delete(stories).where(eq(stories.id, id));
    } catch (error) {
      console.error(`Error deleting story ${id}:`, error);
      throw error;
    }
  }
  
  async incrementStoryViewCount(id: number): Promise<Story> {
    try {
      const [story] = await db.select().from(stories).where(eq(stories.id, id));
      if (!story) throw new Error(`Story with id ${id} not found`);
      
      const [updatedStory] = await db
        .update(stories)
        .set({ viewCount: story.viewCount + 1 })
        .where(eq(stories.id, id))
        .returning();
      
      return updatedStory;
    } catch (error) {
      console.error(`Error incrementing view count for story ${id}:`, error);
      throw error;
    }
  }
  
  // Notification operations
  async getNotificationsByUserId(userId: number): Promise<Notification[]> {
    try {
      return await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));
    } catch (error) {
      console.error(`Error fetching notifications for user ${userId}:`, error);
      return [];
    }
  }
  
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    try {
      const [notification] = await db
        .insert(notifications)
        .values(insertNotification)
        .returning();
      
      return notification;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }
  
  async markNotificationAsRead(id: number): Promise<void> {
    try {
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, id));
    } catch (error) {
      console.error(`Error marking notification ${id} as read:`, error);
      throw error;
    }
  }
  
  async markAllNotificationsAsRead(userId: number): Promise<void> {
    try {
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.userId, userId));
    } catch (error) {
      console.error(`Error marking all notifications as read for user ${userId}:`, error);
      throw error;
    }
  }
  
  async deleteNotification(id: number): Promise<void> {
    try {
      await db
        .delete(notifications)
        .where(eq(notifications.id, id));
    } catch (error) {
      console.error(`Error deleting notification ${id}:`, error);
      throw error;
    }
  }
  
  async deleteAllNotifications(userId: number): Promise<void> {
    try {
      await db
        .delete(notifications)
        .where(eq(notifications.userId, userId));
    } catch (error) {
      console.error(`Error deleting all notifications for user ${userId}:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();