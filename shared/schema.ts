import { pgTable, text, serial, integer, boolean, timestamp, json, doublePrecision, foreignKey, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations, sql } from "drizzle-orm";
import { z } from "zod";

// User schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  profileImageUrl: text("profile_image_url"),
  role: text("role").default("creator").notNull(),
  xpPoints: integer("xp_points").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  bio: true,
  profileImageUrl: true,
  role: true,
});

// Post schema
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  likes: integer("likes").default(0).notNull(),
  comments: integer("comments").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPostSchema = createInsertSchema(posts).pick({
  userId: true,
  content: true,
  imageUrl: true,
});

// Saved Posts schema - junction table for users and their saved posts
export const savedPosts = pgTable("saved_posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Make sure a user can only save a post once (unique constraint)
    userPostUnique: unique().on(table.userId, table.postId)
  };
});

export const insertSavedPostSchema = createInsertSchema(savedPosts).pick({
  userId: true,
  postId: true,
});

// Comment schema
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  parentId: integer("parent_id"),
  content: text("content").notNull(),
  likes: integer("likes").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  postId: true,
  userId: true,
  parentId: true,
  content: true,
});

// Product schema
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: doublePrecision("price").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  rating: doublePrecision("rating").default(0).notNull(),
  reviewCount: integer("review_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).pick({
  userId: true,
  title: true,
  description: true,
  price: true,
  category: true,
  imageUrl: true,
});

// AI Agent schema
export const aiAgents = pgTable("ai_agents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  iconColor: text("icon_color").notNull(),
  backgroundColor: text("background_color").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  isCustom: boolean("is_custom").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  chatCount: integer("chat_count").default(0).notNull(),
  status: text("status").default("active").notNull(),
});

export const insertAiAgentSchema = createInsertSchema(aiAgents).pick({
  userId: true,
  name: true,
  description: true,
  icon: true,
  iconColor: true,
  backgroundColor: true,
  systemPrompt: true,
  isCustom: true,
});

// AI Chat schema
export const aiChats = pgTable("ai_chats", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").references(() => aiAgents.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  messages: json("messages").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiChatSchema = createInsertSchema(aiChats).pick({
  agentId: true,
  userId: true,
  messages: true,
});

// Community schema
export const communities = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  iconColor: text("icon_color").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCommunitySchema = createInsertSchema(communities).pick({
  name: true,
  description: true,
  iconColor: true,
});

// Channel schema
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChannelSchema = createInsertSchema(channels).pick({
  communityId: true,
  name: true,
});

// Channel Message schema
export const channelMessages = pgTable("channel_messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  likes: integer("likes").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChannelMessageSchema = createInsertSchema(channelMessages).pick({
  channelId: true,
  userId: true,
  content: true,
  isPinned: true,
});

// Revenue data schema for dashboard
export const revenue = pgTable("revenue", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  amount: doublePrecision("amount").notNull(),
  date: timestamp("date").notNull(),
  source: text("source").notNull(),
});

export const insertRevenueSchema = createInsertSchema(revenue).pick({
  userId: true,
  amount: true,
  date: true,
  source: true,
});

// Contact schema for CRM
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  contactName: text("contact_name").notNull(),
  contactImage: text("contact_image"),
  purchaseInfo: text("purchase_info"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  userId: true,
  contactName: true,
  contactImage: true,
  purchaseInfo: true,
});

// Document schema for Notion-style editor
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).pick({
  userId: true,
  title: true,
  content: true,
});

// Story schema
export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  mediaUrl: text("media_url").notNull(),
  mediaType: text("media_type").default("image").notNull(), // image or video
  caption: text("caption"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),  // Stories expire after 24 hours
  viewCount: integer("view_count").default(0).notNull(),
});

export const insertStorySchema = createInsertSchema(stories).pick({
  userId: true,
  mediaUrl: true,
  mediaType: true,
  caption: true,
});

// Notification schema
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  linkTo: text("link_to"),
  relatedUserId: integer("related_user_id").references(() => users.id),
  relatedUserImage: text("related_user_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  userId: true,
  type: true,
  message: true,
  read: true,
  linkTo: true,
  relatedUserId: true,
  relatedUserImage: true,
});

// Direct Message Conversation schema
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isGroup: boolean("is_group").default(false).notNull(),
  name: text("name"),
  icon: text("icon"),
});

export const insertConversationSchema = createInsertSchema(conversations);

// Conversation Participants (for both direct messages and group chats)
export const conversationParticipants = pgTable("conversation_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Create a unique constraint so a user can only be in a conversation once
    userConversation: unique("user_conversation").on(table.userId, table.conversationId),
  };
});

export const insertConversationParticipantSchema = createInsertSchema(conversationParticipants).pick({
  conversationId: true,
  userId: true,
  isAdmin: true,
});

// Direct Messages schema
export const directMessages = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  senderId: integer("sender_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  read: boolean("read").default(false).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  isEdited: boolean("is_edited").default(false),
  replyToMessageId: integer("reply_to_message_id"),
  reactions: json("reactions").default({}).notNull(), // Stores user reactions: { userId: reactionType }
});

export const insertDirectMessageSchema = createInsertSchema(directMessages).pick({
  conversationId: true,
  senderId: true,
  content: true,
  read: true,
  isEdited: true,
  replyToMessageId: true,
  reactions: true,
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
  products: many(products),
  aiAgents: many(aiAgents),
  aiChats: many(aiChats),
  channelMessages: many(channelMessages),
  revenues: many(revenue),
  contacts: many(contacts),
  documents: many(documents),
  stories: many(stories),
  notifications: many(notifications),
  relatedToNotifications: many(notifications, { relationName: "related_user" }),
  conversationParticipants: many(conversationParticipants),
  sentMessages: many(directMessages, { relationName: "sender" }),
  savedPosts: many(savedPosts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(users, { fields: [posts.userId], references: [users.id] }),
  comments: many(comments),
  savedByUsers: many(savedPosts),
}));

export const savedPostsRelations = relations(savedPosts, ({ one }) => ({
  user: one(users, { fields: [savedPosts.userId], references: [users.id] }),
  post: one(posts, { fields: [savedPosts.postId], references: [posts.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  user: one(users, { fields: [comments.userId], references: [users.id] }),
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  parent: one(comments, { 
    fields: [comments.parentId], 
    references: [comments.id],
    relationName: "parent_comment"
  }),
  replies: many(comments, { relationName: "parent_comment" }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  user: one(users, { fields: [products.userId], references: [users.id] }),
}));

export const aiAgentsRelations = relations(aiAgents, ({ one, many }) => ({
  user: one(users, { fields: [aiAgents.userId], references: [users.id] }),
  aiChats: many(aiChats),
}));

export const aiChatsRelations = relations(aiChats, ({ one }) => ({
  user: one(users, { fields: [aiChats.userId], references: [users.id] }),
  agent: one(aiAgents, { fields: [aiChats.agentId], references: [aiAgents.id] }),
}));

export const communitiesRelations = relations(communities, ({ many }) => ({
  channels: many(channels),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  community: one(communities, { fields: [channels.communityId], references: [communities.id] }),
  messages: many(channelMessages),
}));

export const channelMessagesRelations = relations(channelMessages, ({ one }) => ({
  channel: one(channels, { fields: [channelMessages.channelId], references: [channels.id] }),
  user: one(users, { fields: [channelMessages.userId], references: [users.id] }),
}));

export const revenueRelations = relations(revenue, ({ one }) => ({
  user: one(users, { fields: [revenue.userId], references: [users.id] }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, { fields: [contacts.userId], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  relatedUser: one(users, { fields: [notifications.relatedUserId], references: [users.id], relationName: "related_user" }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(directMessages),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, { fields: [conversationParticipants.conversationId], references: [conversations.id] }),
  user: one(users, { fields: [conversationParticipants.userId], references: [users.id] }),
}));

export const directMessagesRelations = relations(directMessages, ({ one }) => ({
  conversation: one(conversations, { fields: [directMessages.conversationId], references: [conversations.id] }),
  sender: one(users, { fields: [directMessages.senderId], references: [users.id], relationName: "sender" }),
  replyTo: one(directMessages, { 
    fields: [directMessages.replyToMessageId], 
    references: [directMessages.id],
    relationName: "message_reply" 
  }),
}));

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type AIAgent = typeof aiAgents.$inferSelect;
export type InsertAIAgent = z.infer<typeof insertAiAgentSchema>;

export type AIChat = typeof aiChats.$inferSelect;
export type InsertAIChat = z.infer<typeof insertAiChatSchema>;

export type Community = typeof communities.$inferSelect;
export type InsertCommunity = z.infer<typeof insertCommunitySchema>;

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;

export type ChannelMessage = typeof channelMessages.$inferSelect;
export type InsertChannelMessage = z.infer<typeof insertChannelMessageSchema>;

export type Revenue = typeof revenue.$inferSelect;
export type InsertRevenue = z.infer<typeof insertRevenueSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<typeof insertConversationParticipantSchema>;

export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;

export type Story = typeof stories.$inferSelect;
export type InsertStory = z.infer<typeof insertStorySchema>;

export type SavedPost = typeof savedPosts.$inferSelect;
export type InsertSavedPost = z.infer<typeof insertSavedPostSchema>;
