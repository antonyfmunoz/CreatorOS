import { 
  users, type User, type InsertUser,
  followers, type Follower,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, count, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { IStorage } from "./storage";
import connectPgSimple from "connect-pg-simple";

// Create PostgreSQL session store
const PostgresStore = connectPgSimple(session);

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;
  
  constructor() {
    // Initialize session store with PostgreSQL
    this.sessionStore = new PostgresStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: 'session'
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    console.log(`Getting user with ID: ${id}`);
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error(`Error getting user with ID ${id}:`, error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`Getting user with username: ${username}`);
    try {
      const result = await db.select().from(users).where(eq(users.username, username));
      console.log(`Query result for username ${username}:`, result);
      
      if (result.length === 0) {
        console.log(`No user found with username: ${username}`);
        return undefined;
      }
      
      return result[0];
    } catch (error) {
      console.error(`Error getting user with username ${username}:`, error);
      return undefined;
    }
  }

  async searchUsersByUsername(query: string): Promise<User[]> {
    // Use the SQL template literals for case-insensitive search
    return await db
      .select()
      .from(users)
      .where(sql`${users.username} ILIKE ${`%${query}%`}`)
      .limit(10);
  }

  async createUser(userData: InsertUser): Promise<User> {
    console.log(`Creating user with username: ${userData.username}`);
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  // Follower methods  
  async followUser(followerId: number, followedId: number): Promise<void> {
    await db.insert(followers).values({
      followerId,
      followedId,
    });
  }

  async unfollowUser(followerId: number, followedId: number): Promise<void> {
    await db
      .delete(followers)
      .where(
        and(
          eq(followers.followerId, followerId),
          eq(followers.followedId, followedId)
        )
      );
  }

  async getFollowers(userId: number): Promise<User[]> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
        bio: users.bio,
        role: users.role,
        xpPoints: users.xpPoints,
        level: users.level,
        createdAt: users.createdAt,
        password: users.password,
      })
      .from(followers)
      .innerJoin(users, eq(followers.followerId, users.id))
      .where(eq(followers.followedId, userId))
      .orderBy(desc(followers.createdAt));
    
    return result;
  }

  async getFollowing(userId: number): Promise<User[]> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
        bio: users.bio,
        role: users.role,
        xpPoints: users.xpPoints,
        level: users.level,
        createdAt: users.createdAt,
        password: users.password,
      })
      .from(followers)
      .innerJoin(users, eq(followers.followedId, users.id))
      .where(eq(followers.followerId, userId))
      .orderBy(desc(followers.createdAt));
    
    return result;
  }

  async getFollowerCount(userId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(followers)
      .where(eq(followers.followedId, userId));
    
    return result.count;
  }

  async getFollowingCount(userId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(followers)
      .where(eq(followers.followerId, userId));
    
    return result.count;
  }

  async isFollowing(followerId: number, followedId: number): Promise<boolean> {
    const result = await db
      .select()
      .from(followers)
      .where(
        and(
          eq(followers.followerId, followerId),
          eq(followers.followedId, followedId)
        )
      );
    
    return result.length > 0;
  }

  // Stubs for other methods required by IStorage interface
  // These will need to be implemented properly when needed
  async getPosts() { return []; }
  async getPostById() { return undefined; }
  async getPostsByUserId() { return []; }
  async createPost(post: any) { return {} as any; }
  async updatePost() { return {} as any; }
  async deletePost() {}
  async likePost() { return {} as any; }
  async unlikePost() { return {} as any; }
  async savePost() {}
  async unsavePost() {}
  async getSavedPosts() { return []; }
  async getPostCountByUser() { return 0; }
  async getCommentsByPostId() { return []; }
  async getCommentReplies() { return []; }
  async getCommentById() { return undefined; }
  async createComment() { return {} as any; }
  async updateComment() { return {} as any; }
  async deleteComment() {}
  async likeComment() { return {} as any; }
  async unlikeComment() { return {} as any; }
  async getTotalCommentCountForPost() { return 0; }
  async getProducts() { return []; }
  async getProductById() { return undefined; }
  async getProductsByCategory() { return []; }
  async createProduct() { return {} as any; }
  async getAIAgents() { return []; }
  async getAIAgentById() { return undefined; }
  async getUserAIAgents() { return []; }
  async createAIAgent() { return {} as any; }
  async getAIChatsByAgentId() { return []; }
  async createAIChat() { return {} as any; }
  async updateAIChat() { return {} as any; }
  async getCommunities() { return []; }
  async getCommunityById() { return undefined; }
  async createCommunity() { return {} as any; }
  async getChannelsByCommunityId() { return []; }
  async getChannelById() { return undefined; }
  async createChannel() { return {} as any; }
  async getMessagesByChannelId() { return []; }
  async createChannelMessage() { return {} as any; }
  async pinChannelMessage() { return {} as any; }
  async likeChannelMessage() { return {} as any; }
  async getRevenueByUserId() { return []; }
  async createRevenue() { return {} as any; }
  async getContactsByUserId() { return []; }
  async createContact() { return {} as any; }
  async getDocumentsByUserId() { return []; }
  async getDocumentById() { return undefined; }
  async createDocument() { return {} as any; }
  async updateDocument() { return {} as any; }
  async getNotificationsByUserId() { return []; }
  async createNotification() { return {} as any; }
  async markNotificationAsRead() { return {} as any; }
  async markAllNotificationsAsRead() {}
  async deleteNotification() {}
  async deleteAllNotifications() {}
  async getConversationsByUserId() { return []; }
  async getConversationById() { return undefined; }
  async getParticipantsByConversationId() { return []; }
  async createConversation() { return {} as any; }
  async addParticipantToConversation() { return {} as any; }
  async removeParticipantFromConversation() {}
  async deleteConversation() {}
  async getMessagesByConversationId() { return []; }
  async createDirectMessage() { return {} as any; }
  async updateDirectMessage() { return {} as any; }
  async deleteDirectMessage() {}
  async addReactionToMessage() { return {} as any; }
  async markMessageAsRead() { return {} as any; }
  async markConversationAsRead() {}
  async getUnreadMessageCountForUser() { return 0; }
  async getStories() { return []; }
  async getUserStories() { return []; }
  async getStoryById() { return undefined; }
  async createStory() { return {} as any; }
  async deleteStory() {}
  async incrementStoryViewCount() { return {} as any; }
}