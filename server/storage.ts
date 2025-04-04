import { 
  users, type User, type InsertUser,
  posts, type Post, type InsertPost,
  comments, type Comment, type InsertComment,
  products, type Product, type InsertProduct,
  aiAgents, type AIAgent, type InsertAIAgent,
  aiChats, type AIChat, type InsertAIChat,
  communities, type Community, type InsertCommunity,
  channels, type Channel, type InsertChannel,
  channelMessages, type ChannelMessage, type InsertChannelMessage,
  revenue, type Revenue, type InsertRevenue,
  contacts, type Contact, type InsertContact,
  documents, type Document, type InsertDocument
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, isNull } from "drizzle-orm";

// Storage interface for the application
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // Post operations
  getPosts(): Promise<(Post & { user: User })[]>;
  getPostById(id: number): Promise<(Post & { user: User }) | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  likePost(id: number): Promise<Post>;
  unlikePost(id: number): Promise<Post>;

  // Comment operations
  getCommentsByPostId(postId: number): Promise<(Comment & { user: User })[]>;
  getCommentReplies(commentId: number): Promise<(Comment & { user: User })[]>;
  getCommentById(id: number): Promise<(Comment & { user: User }) | undefined>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: number, content: string): Promise<Comment>;
  deleteComment(id: number): Promise<void>;
  likeComment(id: number): Promise<Comment>;
  unlikeComment(id: number): Promise<Comment>;

  // Product operations
  getProducts(): Promise<(Product & { user: User })[]>;
  getProductById(id: number): Promise<(Product & { user: User }) | undefined>;
  getProductsByCategory(category: string): Promise<(Product & { user: User })[]>;
  createProduct(product: InsertProduct): Promise<Product>;

  // AI Agent operations
  getAIAgents(): Promise<AIAgent[]>;
  getAIAgentById(id: number): Promise<AIAgent | undefined>;
  getUserAIAgents(userId: number): Promise<AIAgent[]>;
  createAIAgent(agent: InsertAIAgent): Promise<AIAgent>;

  // AI Chat operations
  getAIChatsByAgentId(agentId: number, userId: number): Promise<AIChat[]>;
  createAIChat(chat: InsertAIChat): Promise<AIChat>;
  updateAIChat(id: number, messages: any): Promise<AIChat>;

  // Community operations
  getCommunities(): Promise<Community[]>;
  getCommunityById(id: number): Promise<Community | undefined>;
  createCommunity(community: InsertCommunity): Promise<Community>;

  // Channel operations
  getChannelsByCommunityId(communityId: number): Promise<Channel[]>;
  getChannelById(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;

  // Channel Message operations
  getMessagesByChannelId(channelId: number): Promise<(ChannelMessage & { user: User })[]>;
  createChannelMessage(message: InsertChannelMessage): Promise<ChannelMessage>;
  pinChannelMessage(id: number): Promise<ChannelMessage>;
  likeChannelMessage(id: number): Promise<ChannelMessage>;

  // Revenue operations
  getRevenueByUserId(userId: number): Promise<Revenue[]>;
  createRevenue(revenue: InsertRevenue): Promise<Revenue>;

  // Contact operations
  getContactsByUserId(userId: number): Promise<Contact[]>;
  createContact(contact: InsertContact): Promise<Contact>;

  // Document operations
  getDocumentsByUserId(userId: number): Promise<Document[]>;
  getDocumentById(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, title: string, content: string): Promise<Document>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private posts: Map<number, Post>;
  private comments: Map<number, Comment>;
  private products: Map<number, Product>;
  private aiAgents: Map<number, AIAgent>;
  private aiChats: Map<number, AIChat>;
  private communities: Map<number, Community>;
  private channels: Map<number, Channel>;
  private channelMessages: Map<number, ChannelMessage>;
  private revenues: Map<number, Revenue>;
  private contacts: Map<number, Contact>;
  private documents: Map<number, Document>;

  private userIdCounter = 1;
  private postIdCounter = 1;
  private commentIdCounter = 1;
  private productIdCounter = 1;
  private aiAgentIdCounter = 1;
  private aiChatIdCounter = 1;
  private communityIdCounter = 1;
  private channelIdCounter = 1;
  private channelMessageIdCounter = 1;
  private revenueIdCounter = 1;
  private contactIdCounter = 1;
  private documentIdCounter = 1;

  constructor() {
    this.users = new Map();
    this.posts = new Map();
    this.comments = new Map();
    this.products = new Map();
    this.aiAgents = new Map();
    this.aiChats = new Map();
    this.communities = new Map();
    this.channels = new Map();
    this.channelMessages = new Map();
    this.revenues = new Map();
    this.contacts = new Map();
    this.documents = new Map();
    
    // Initialize with sample data
    this.initializeData();
  }

  private initializeData() {
    // Create sample users
    const user1 = this.createUser({
      username: 'johndoe',
      password: 'password123',
      displayName: 'John Doe',
      bio: 'Digital Creator & Entrepreneur',
      profileImageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
      role: 'creator',
    });

    const user2 = this.createUser({
      username: 'sarahmitchell',
      password: 'password123',
      displayName: 'Sarah Mitchell',
      bio: 'Marketing Expert',
      profileImageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
      role: 'creator',
    });

    const user3 = this.createUser({
      username: 'davidkim',
      password: 'password123',
      displayName: 'David Kim',
      bio: 'Web Developer',
      profileImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
      role: 'creator',
    });

    const user4 = this.createUser({
      username: 'emmathompson',
      password: 'password123',
      displayName: 'Emma Thompson',
      bio: 'UX Designer',
      profileImageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
      role: 'creator',
    });

    const user5 = this.createUser({
      username: 'michaeljones',
      password: 'password123',
      displayName: 'Michael Jones',
      bio: 'Social Media Marketing',
      profileImageUrl: 'https://images.unsplash.com/photo-1603415526960-f7e0328c63b1',
      role: 'creator',
    });

    // Create sample posts
    this.createPost({
      userId: 2,
      content: 'Just launched my new course on content marketing strategy! Check it out in the marketplace 🚀',
      imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978',
    });

    this.createPost({
      userId: 3,
      content: 'Hosting a free webinar tomorrow on "Building Scalable React Applications" - Join our community to participate!',
      imageUrl: '',
    });

    this.createPost({
      userId: 4,
      content: 'I just wrapped up my latest UI design system. Excited to share what I\'ve learned!',
      imageUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5',
    });

    // Create sample products
    this.createProduct({
      userId: 2,
      title: 'Content Marketing Mastery',
      description: 'A comprehensive guide to content marketing strategy',
      price: 49.99,
      category: 'Course',
      imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40',
    });

    this.createProduct({
      userId: 5,
      title: 'Productivity Planner',
      description: 'Boost your productivity with this custom planner',
      price: 19.99,
      category: 'Template',
      imageUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643',
    });

    this.createProduct({
      userId: 3,
      title: 'Web Development Bootcamp',
      description: 'Learn modern web development from scratch',
      price: 89.99,
      category: 'Course',
      imageUrl: 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b',
    });

    this.createProduct({
      userId: 4,
      title: 'UX Design Principles',
      description: 'Master the fundamentals of user experience design',
      price: 69.99,
      category: 'Course',
      imageUrl: 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28',
    });

    this.createProduct({
      userId: 5,
      title: 'Social Media Marketing',
      description: 'Strategies for effective social media marketing',
      price: 59.99,
      category: 'Course',
      imageUrl: 'https://images.unsplash.com/photo-1611926653458-09294b3142bf',
    });

    this.createProduct({
      userId: 5,
      title: 'AI for Creators',
      description: 'Learn how to leverage AI in your creative work',
      price: 39.99,
      category: 'eBook',
      imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3',
    });

    this.createProduct({
      userId: 2,
      title: 'Business Plan Template',
      description: 'Professional business plan template for entrepreneurs',
      price: 24.99,
      category: 'Template',
      imageUrl: 'https://images.unsplash.com/photo-1544377193-33dcf4d68fb5',
    });

    // Create AI agents
    this.createAIAgent({
      userId: 1,
      name: 'Content Assistant',
      description: 'Writes blog posts, social media captions, and email copy',
      icon: 'Pencil',
      iconColor: 'text-primary',
      backgroundColor: 'bg-blue-100',
      systemPrompt: 'You are a content assistant specializing in writing engaging copy for various formats.',
      isCustom: false,
    });

    this.createAIAgent({
      userId: 1,
      name: 'Code Helper',
      description: 'Assists with programming tasks and debugging',
      icon: 'Code',
      iconColor: 'text-secondary',
      backgroundColor: 'bg-purple-100',
      systemPrompt: 'You are a programming assistant that helps with code, debugging, and technical questions.',
      isCustom: false,
    });

    this.createAIAgent({
      userId: 1,
      name: 'Market Analyst',
      description: 'Provides insights on market trends and opportunities',
      icon: 'BarChart',
      iconColor: 'text-green-600',
      backgroundColor: 'bg-green-100',
      systemPrompt: 'You are a market research assistant that provides analysis and insights on industry trends.',
      isCustom: false,
    });

    this.createAIAgent({
      userId: 1,
      name: 'Design Consultant',
      description: 'Helps with UI/UX design and visual branding',
      icon: 'Image',
      iconColor: 'text-pink-600',
      backgroundColor: 'bg-pink-100',
      systemPrompt: 'You are a design consultant that helps with UI/UX decisions and visual branding strategies.',
      isCustom: false,
    });

    this.createAIAgent({
      userId: 1,
      name: 'Course Creator Helper',
      description: 'Assists with creating course outlines and content structure',
      icon: 'GraduationCap',
      iconColor: 'text-amber-600',
      backgroundColor: 'bg-amber-100',
      systemPrompt: 'You are a course creation assistant that helps structure learning content and create effective educational materials.',
      isCustom: true,
    });

    // Create communities
    const community1 = this.createCommunity({
      name: 'Web Developers',
      description: 'A community for web developers to share knowledge and resources',
      iconColor: 'bg-green-500',
    });

    const community2 = this.createCommunity({
      name: 'Content Creators',
      description: 'For content creators across all platforms',
      iconColor: 'bg-yellow-500',
    });

    const community3 = this.createCommunity({
      name: 'UX/UI Design',
      description: 'Designers sharing work and feedback',
      iconColor: 'bg-purple-500',
    });

    // Create channels
    const channel1 = this.createChannel({
      communityId: 1,
      name: 'general',
    });

    this.createChannel({
      communityId: 1,
      name: 'frontend',
    });

    this.createChannel({
      communityId: 1,
      name: 'backend',
    });

    this.createChannel({
      communityId: 1,
      name: 'job-board',
    });

    this.createChannel({
      communityId: 1,
      name: 'resources',
    });

    // Create channel messages
    this.createChannelMessage({
      channelId: 1,
      userId: 3,
      content: 'Hey everyone! I just published a new tutorial on building React components with TypeScript. Check it out!',
      isPinned: false,
    });

    this.createChannelMessage({
      channelId: 1,
      userId: 4,
      content: 'Thanks for sharing, David! I\'ve been looking for good TypeScript resources.',
      isPinned: false,
    });

    this.createChannelMessage({
      channelId: 1,
      userId: 2,
      content: 'Hey everyone! I\'m organizing a virtual hackathon next month. Would anyone be interested in participating?',
      isPinned: false,
    });

    this.createChannelMessage({
      channelId: 1,
      userId: 5,
      content: 'Welcome to the Web Developers community! Please read our guidelines and introduce yourself in the #introductions channel.',
      isPinned: true,
    });

    // Create revenue data
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      
      this.createRevenue({
        userId: 1,
        amount: Math.random() * 500 + 100,
        date,
        source: 'Course Sales',
      });
    }

    // Create contacts
    this.createContact({
      userId: 1,
      contactName: 'Sarah Mitchell',
      contactImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
      purchaseInfo: 'Purchased: Content Marketing Course',
    });

    this.createContact({
      userId: 1,
      contactName: 'David Kim',
      contactImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
      purchaseInfo: 'Purchased: Web Development Bootcamp',
    });

    this.createContact({
      userId: 1,
      contactName: 'Emma Thompson',
      contactImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
      purchaseInfo: 'Subscribed: Pro Membership',
    });

    // Create document
    this.createDocument({
      userId: 1,
      title: 'Content Strategy 2023',
      content: `<h1 class="text-xl font-bold mb-2">Content Strategy 2023</h1>
      <p class="mb-4">This document outlines our content strategy for the upcoming quarter.</p>
      <h2 class="text-lg font-semibold mb-2">Key Goals:</h2>
      <ul class="list-disc pl-5 mb-4">
        <li>Increase blog traffic by 25%</li>
        <li>Launch 2 new video series</li>
        <li>Expand newsletter to 10k subscribers</li>
      </ul>
      <p>Click to edit this document and add your own content...</p>`,
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id, 
      createdAt: now,
      xpPoints: 0,
      level: 1,
    };
    this.users.set(id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Post operations
  async getPosts(): Promise<(Post & { user: User })[]> {
    return Array.from(this.posts.values()).map(post => {
      const user = this.users.get(post.userId)!;
      return { ...post, user };
    }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getPostById(id: number): Promise<(Post & { user: User }) | undefined> {
    const post = this.posts.get(id);
    if (!post) return undefined;
    
    const user = this.users.get(post.userId)!;
    return { ...post, user };
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const id = this.postIdCounter++;
    const now = new Date();
    const post: Post = { 
      ...insertPost, 
      id, 
      likes: 0, 
      comments: 0, 
      createdAt: now,
    };
    this.posts.set(id, post);
    return post;
  }

  async likePost(id: number): Promise<Post> {
    const post = this.posts.get(id);
    if (!post) throw new Error('Post not found');
    
    post.likes++;
    this.posts.set(id, post);
    return post;
  }

  async unlikePost(id: number): Promise<Post> {
    const post = this.posts.get(id);
    if (!post) throw new Error('Post not found');
    
    // Prevent negative likes
    post.likes = Math.max(0, post.likes - 1);
    this.posts.set(id, post);
    return post;
  }

  // Comment operations
  async getCommentsByPostId(postId: number): Promise<(Comment & { user: User })[]> {
    return Array.from(this.comments.values())
      .filter(comment => comment.postId === postId && comment.parentId === null)
      .map(comment => {
        const user = this.users.get(comment.userId)!;
        return { ...comment, user };
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getCommentById(id: number): Promise<(Comment & { user: User }) | undefined> {
    const comment = this.comments.get(id);
    if (!comment) return undefined;
    
    const user = this.users.get(comment.userId)!;
    return { ...comment, user };
  }

  async getCommentReplies(commentId: number): Promise<(Comment & { user: User })[]> {
    return Array.from(this.comments.values())
      .filter(comment => comment.parentId === commentId)
      .map(comment => {
        const user = this.users.get(comment.userId)!;
        return { ...comment, user };
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const id = this.commentIdCounter++;
    const now = new Date();
    const comment: Comment = { ...insertComment, id, createdAt: now, likes: 0 };
    this.comments.set(id, comment);
    
    // Update comment count on the post
    const post = this.posts.get(insertComment.postId);
    if (post) {
      post.comments++;
      this.posts.set(post.id, post);
    }
    
    return comment;
  }
  
  async updateComment(id: number, content: string): Promise<Comment> {
    const comment = this.comments.get(id);
    if (!comment) throw new Error('Comment not found');
    
    comment.content = content;
    this.comments.set(id, comment);
    return comment;
  }

  async deleteComment(id: number): Promise<void> {
    const comment = this.comments.get(id);
    if (!comment) throw new Error('Comment not found');
    
    // If it's a top-level comment, decrement the post's comment count
    if (comment.parentId === null) {
      const post = this.posts.get(comment.postId);
      if (post) {
        post.comments = Math.max(0, post.comments - 1);
        this.posts.set(post.id, post);
      }
    }
    
    // Remove the comment itself
    this.comments.delete(id);
    
    // Also remove all replies to this comment
    const replies = Array.from(this.comments.values())
      .filter(c => c.parentId === id);
      
    replies.forEach(reply => {
      this.comments.delete(reply.id);
    });
  }
  
  async likeComment(id: number): Promise<Comment> {
    const comment = this.comments.get(id);
    if (!comment) throw new Error('Comment not found');
    
    comment.likes++;
    this.comments.set(id, comment);
    return comment;
  }
  
  async unlikeComment(id: number): Promise<Comment> {
    const comment = this.comments.get(id);
    if (!comment) throw new Error('Comment not found');
    
    // Prevent negative likes
    comment.likes = Math.max(0, comment.likes - 1);
    this.comments.set(id, comment);
    return comment;
  }

  // Product operations
  async getProducts(): Promise<(Product & { user: User })[]> {
    return Array.from(this.products.values()).map(product => {
      const user = this.users.get(product.userId)!;
      return { ...product, user };
    });
  }

  async getProductById(id: number): Promise<(Product & { user: User }) | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;
    
    const user = this.users.get(product.userId)!;
    return { ...product, user };
  }

  async getProductsByCategory(category: string): Promise<(Product & { user: User })[]> {
    return Array.from(this.products.values())
      .filter(product => product.category === category)
      .map(product => {
        const user = this.users.get(product.userId)!;
        return { ...product, user };
      });
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.productIdCounter++;
    const now = new Date();
    const product: Product = { 
      ...insertProduct, 
      id, 
      rating: 0, 
      reviewCount: 0, 
      createdAt: now,
    };
    this.products.set(id, product);
    return product;
  }

  // AI Agent operations
  async getAIAgents(): Promise<AIAgent[]> {
    return Array.from(this.aiAgents.values())
      .filter(agent => !agent.isCustom);
  }

  async getAIAgentById(id: number): Promise<AIAgent | undefined> {
    return this.aiAgents.get(id);
  }

  async getUserAIAgents(userId: number): Promise<AIAgent[]> {
    return Array.from(this.aiAgents.values())
      .filter(agent => agent.isCustom && agent.userId === userId);
  }

  async createAIAgent(insertAgent: InsertAIAgent): Promise<AIAgent> {
    const id = this.aiAgentIdCounter++;
    const now = new Date();
    const agent: AIAgent = { 
      ...insertAgent, 
      id, 
      createdAt: now, 
      chatCount: 0,
      status: 'active',
    };
    this.aiAgents.set(id, agent);
    return agent;
  }

  // AI Chat operations
  async getAIChatsByAgentId(agentId: number, userId: number): Promise<AIChat[]> {
    return Array.from(this.aiChats.values())
      .filter(chat => chat.agentId === agentId && chat.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async createAIChat(insertChat: InsertAIChat): Promise<AIChat> {
    const id = this.aiChatIdCounter++;
    const now = new Date();
    const chat: AIChat = { 
      ...insertChat, 
      id, 
      createdAt: now,
      updatedAt: now, 
    };
    this.aiChats.set(id, chat);
    
    // Update chat count on the agent
    const agent = this.aiAgents.get(insertChat.agentId);
    if (agent) {
      agent.chatCount++;
      this.aiAgents.set(agent.id, agent);
    }
    
    return chat;
  }

  async updateAIChat(id: number, messages: any): Promise<AIChat> {
    const chat = this.aiChats.get(id);
    if (!chat) throw new Error('Chat not found');
    
    chat.messages = messages;
    chat.updatedAt = new Date();
    this.aiChats.set(id, chat);
    return chat;
  }

  // Community operations
  async getCommunities(): Promise<Community[]> {
    return Array.from(this.communities.values());
  }

  async getCommunityById(id: number): Promise<Community | undefined> {
    return this.communities.get(id);
  }

  async createCommunity(insertCommunity: InsertCommunity): Promise<Community> {
    const id = this.communityIdCounter++;
    const now = new Date();
    const community: Community = { ...insertCommunity, id, createdAt: now };
    this.communities.set(id, community);
    return community;
  }

  // Channel operations
  async getChannelsByCommunityId(communityId: number): Promise<Channel[]> {
    return Array.from(this.channels.values())
      .filter(channel => channel.communityId === communityId);
  }

  async getChannelById(id: number): Promise<Channel | undefined> {
    return this.channels.get(id);
  }

  async createChannel(insertChannel: InsertChannel): Promise<Channel> {
    const id = this.channelIdCounter++;
    const now = new Date();
    const channel: Channel = { ...insertChannel, id, createdAt: now };
    this.channels.set(id, channel);
    return channel;
  }

  // Channel Message operations
  async getMessagesByChannelId(channelId: number): Promise<(ChannelMessage & { user: User })[]> {
    return Array.from(this.channelMessages.values())
      .filter(message => message.channelId === channelId)
      .map(message => {
        const user = this.users.get(message.userId)!;
        return { ...message, user };
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createChannelMessage(insertMessage: InsertChannelMessage): Promise<ChannelMessage> {
    const id = this.channelMessageIdCounter++;
    const now = new Date();
    const message: ChannelMessage = { 
      ...insertMessage, 
      id, 
      likes: 0,
      createdAt: now,
    };
    this.channelMessages.set(id, message);
    return message;
  }

  async pinChannelMessage(id: number): Promise<ChannelMessage> {
    const message = this.channelMessages.get(id);
    if (!message) throw new Error('Message not found');
    
    message.isPinned = !message.isPinned;
    this.channelMessages.set(id, message);
    return message;
  }

  async likeChannelMessage(id: number): Promise<ChannelMessage> {
    const message = this.channelMessages.get(id);
    if (!message) throw new Error('Message not found');
    
    message.likes++;
    this.channelMessages.set(id, message);
    return message;
  }

  // Revenue operations
  async getRevenueByUserId(userId: number): Promise<Revenue[]> {
    return Array.from(this.revenues.values())
      .filter(revenue => revenue.userId === userId)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async createRevenue(insertRevenue: InsertRevenue): Promise<Revenue> {
    const id = this.revenueIdCounter++;
    const revenue: Revenue = { ...insertRevenue, id };
    this.revenues.set(id, revenue);
    return revenue;
  }

  // Contact operations
  async getContactsByUserId(userId: number): Promise<Contact[]> {
    return Array.from(this.contacts.values())
      .filter(contact => contact.userId === userId);
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const id = this.contactIdCounter++;
    const now = new Date();
    const contact: Contact = { ...insertContact, id, createdAt: now };
    this.contacts.set(id, contact);
    return contact;
  }

  // Document operations
  async getDocumentsByUserId(userId: number): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(document => document.userId === userId);
  }

  async getDocumentById(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const id = this.documentIdCounter++;
    const now = new Date();
    const document: Document = { 
      ...insertDocument, 
      id, 
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(id, document);
    return document;
  }

  async updateDocument(id: number, title: string, content: string): Promise<Document> {
    const document = this.documents.get(id);
    if (!document) throw new Error('Document not found');
    
    document.title = title;
    document.content = content;
    document.updatedAt = new Date();
    this.documents.set(id, document);
    return document;
  }
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      xpPoints: 0,
      level: 1,
    }).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  // Post operations
  async getPosts(): Promise<(Post & { user: User })[]> {
    const result = await db.select({
      post: posts,
      user: users,
    }).from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .orderBy(desc(posts.createdAt));
    
    return result.map(({ post, user }) => ({ ...post, user }));
  }

  async getPostById(id: number): Promise<(Post & { user: User }) | undefined> {
    const [result] = await db.select({
      post: posts,
      user: users,
    }).from(posts)
      .innerJoin(users, eq(posts.userId, users.id))
      .where(eq(posts.id, id));
    
    if (!result) return undefined;
    return { ...result.post, user: result.user };
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await db.insert(posts).values(insertPost).returning();
    return post;
  }

  async likePost(id: number): Promise<Post> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    if (!post) throw new Error(`Post with id ${id} not found`);
    
    const [updatedPost] = await db
      .update(posts)
      .set({ likes: post.likes + 1 })
      .where(eq(posts.id, id))
      .returning();
    
    return updatedPost;
  }

  async unlikePost(id: number): Promise<Post> {
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
  }

  // Comment operations
  async getCommentsByPostId(postId: number): Promise<(Comment & { user: User })[]> {
    const result = await db.select({
      comment: comments,
      user: users,
    }).from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(
        and(
          eq(comments.postId, postId),
          isNull(comments.parentId)
        )
      )
      .orderBy(desc(comments.createdAt));
    
    return result.map(({ comment, user }) => ({ ...comment, user }));
  }

  async getCommentReplies(commentId: number): Promise<(Comment & { user: User })[]> {
    const result = await db.select({
      comment: comments,
      user: users,
    }).from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.parentId, commentId))
      .orderBy(desc(comments.createdAt));
    
    return result.map(({ comment, user }) => ({ ...comment, user }));
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    // First fetch the current post to get the comment count
    const [post] = await db.select().from(posts).where(eq(posts.id, insertComment.postId));
    if (!post) throw new Error(`Post with id ${insertComment.postId} not found`);
    
    // Update post comment count
    await db
      .update(posts)
      .set({ comments: post.comments + 1 })
      .where(eq(posts.id, insertComment.postId));
    
    const [comment] = await db.insert(comments).values(insertComment).returning();
    return comment;
  }
  
  async getCommentById(id: number): Promise<(Comment & { user: User }) | undefined> {
    const [result] = await db.select({
      comment: comments,
      user: users,
    }).from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.id, id));
    
    if (!result) return undefined;
    return { ...result.comment, user: result.user };
  }

  async updateComment(id: number, content: string): Promise<Comment> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    if (!comment) throw new Error(`Comment with id ${id} not found`);
    
    const [updatedComment] = await db
      .update(comments)
      .set({ content })
      .where(eq(comments.id, id))
      .returning();
    
    return updatedComment;
  }

  async deleteComment(id: number): Promise<void> {
    // First check if the comment exists
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    if (!comment) throw new Error(`Comment with id ${id} not found`);
    
    // If it's a top-level comment, decrement the post's comment count
    if (comment.parentId === null) {
      const [post] = await db.select().from(posts).where(eq(posts.id, comment.postId));
      if (post) {
        // Update the post's comment count
        await db
          .update(posts)
          .set({ comments: Math.max(0, post.comments - 1) })
          .where(eq(posts.id, comment.postId));
      }
    }
    
    // Find all replies to delete them as well
    const replies = await db.select().from(comments).where(eq(comments.parentId, id));
    
    // Delete all replies
    if (replies.length > 0) {
      await db.delete(comments).where(eq(comments.parentId, id));
    }
    
    // Delete the comment itself
    await db.delete(comments).where(eq(comments.id, id));
  }
  
  async likeComment(id: number): Promise<Comment> {
    // Get the comment with user info to return a more complete response
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    if (!comment) throw new Error(`Comment with id ${id} not found`);
    
    // Update the like count
    const [updatedComment] = await db
      .update(comments)
      .set({ likes: comment.likes + 1 })
      .where(eq(comments.id, id))
      .returning();
    
    return updatedComment;
  }
  
  async unlikeComment(id: number): Promise<Comment> {
    // Get the comment
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    if (!comment) throw new Error(`Comment with id ${id} not found`);
    
    // Prevent negative likes
    const newLikes = Math.max(0, comment.likes - 1);
    
    // Update the like count
    const [updatedComment] = await db
      .update(comments)
      .set({ likes: newLikes })
      .where(eq(comments.id, id))
      .returning();
    
    return updatedComment;
  }

  // Product operations
  async getProducts(): Promise<(Product & { user: User })[]> {
    const result = await db.select({
      product: products,
      user: users,
    }).from(products)
      .innerJoin(users, eq(products.userId, users.id))
      .orderBy(desc(products.createdAt));
    
    return result.map(({ product, user }) => ({ ...product, user }));
  }

  async getProductById(id: number): Promise<(Product & { user: User }) | undefined> {
    const [result] = await db.select({
      product: products,
      user: users,
    }).from(products)
      .innerJoin(users, eq(products.userId, users.id))
      .where(eq(products.id, id));
    
    if (!result) return undefined;
    return { ...result.product, user: result.user };
  }

  async getProductsByCategory(category: string): Promise<(Product & { user: User })[]> {
    const result = await db.select({
      product: products,
      user: users,
    }).from(products)
      .innerJoin(users, eq(products.userId, users.id))
      .where(eq(products.category, category))
      .orderBy(desc(products.createdAt));
    
    return result.map(({ product, user }) => ({ ...product, user }));
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }

  // AI Agent operations
  async getAIAgents(): Promise<AIAgent[]> {
    return await db.select().from(aiAgents);
  }

  async getAIAgentById(id: number): Promise<AIAgent | undefined> {
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, id));
    return agent || undefined;
  }

  async getUserAIAgents(userId: number): Promise<AIAgent[]> {
    return await db.select().from(aiAgents).where(eq(aiAgents.userId, userId));
  }

  async createAIAgent(insertAgent: InsertAIAgent): Promise<AIAgent> {
    const [agent] = await db.insert(aiAgents).values(insertAgent).returning();
    return agent;
  }

  // AI Chat operations
  async getAIChatsByAgentId(agentId: number, userId: number): Promise<AIChat[]> {
    return await db
      .select()
      .from(aiChats)
      .where(and(
        eq(aiChats.agentId, agentId),
        eq(aiChats.userId, userId)
      ))
      .orderBy(desc(aiChats.updatedAt));
  }

  async createAIChat(insertChat: InsertAIChat): Promise<AIChat> {
    // First fetch the agent to get current chat count
    const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, insertChat.agentId));
    if (!agent) throw new Error(`Agent with id ${insertChat.agentId} not found`);
    
    // Increment chat count for the agent
    await db
      .update(aiAgents)
      .set({ chatCount: agent.chatCount + 1 })
      .where(eq(aiAgents.id, insertChat.agentId));
    
    const [chat] = await db.insert(aiChats).values(insertChat).returning();
    return chat;
  }

  async updateAIChat(id: number, messages: any): Promise<AIChat> {
    const now = new Date();
    const [chat] = await db
      .update(aiChats)
      .set({ messages, updatedAt: now })
      .where(eq(aiChats.id, id))
      .returning();
    
    return chat;
  }

  // Community operations
  async getCommunities(): Promise<Community[]> {
    return await db.select().from(communities);
  }

  async getCommunityById(id: number): Promise<Community | undefined> {
    const [community] = await db.select().from(communities).where(eq(communities.id, id));
    return community || undefined;
  }

  async createCommunity(insertCommunity: InsertCommunity): Promise<Community> {
    const [community] = await db.insert(communities).values(insertCommunity).returning();
    return community;
  }

  // Channel operations
  async getChannelsByCommunityId(communityId: number): Promise<Channel[]> {
    return await db
      .select()
      .from(channels)
      .where(eq(channels.communityId, communityId));
  }

  async getChannelById(id: number): Promise<Channel | undefined> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, id));
    return channel || undefined;
  }

  async createChannel(insertChannel: InsertChannel): Promise<Channel> {
    const [channel] = await db.insert(channels).values(insertChannel).returning();
    return channel;
  }

  // Channel Message operations
  async getMessagesByChannelId(channelId: number): Promise<(ChannelMessage & { user: User })[]> {
    const result = await db.select({
      message: channelMessages,
      user: users,
    }).from(channelMessages)
      .innerJoin(users, eq(channelMessages.userId, users.id))
      .where(eq(channelMessages.channelId, channelId))
      .orderBy(desc(channelMessages.createdAt));
    
    return result.map(({ message, user }) => ({ ...message, user }));
  }

  async createChannelMessage(insertMessage: InsertChannelMessage): Promise<ChannelMessage> {
    const [message] = await db.insert(channelMessages).values(insertMessage).returning();
    return message;
  }

  async pinChannelMessage(id: number): Promise<ChannelMessage> {
    const [message] = await db.select().from(channelMessages).where(eq(channelMessages.id, id));
    if (!message) throw new Error(`Message with id ${id} not found`);
    
    const [updatedMessage] = await db
      .update(channelMessages)
      .set({ isPinned: !message.isPinned })
      .where(eq(channelMessages.id, id))
      .returning();
    
    return updatedMessage;
  }

  async likeChannelMessage(id: number): Promise<ChannelMessage> {
    const [message] = await db.select().from(channelMessages).where(eq(channelMessages.id, id));
    if (!message) throw new Error(`Message with id ${id} not found`);
    
    const [updatedMessage] = await db
      .update(channelMessages)
      .set({ likes: message.likes + 1 })
      .where(eq(channelMessages.id, id))
      .returning();
    
    return updatedMessage;
  }

  // Revenue operations
  async getRevenueByUserId(userId: number): Promise<Revenue[]> {
    return await db
      .select()
      .from(revenue)
      .where(eq(revenue.userId, userId))
      .orderBy(desc(revenue.date));
  }

  async createRevenue(insertRevenue: InsertRevenue): Promise<Revenue> {
    const [revenueItem] = await db.insert(revenue).values(insertRevenue).returning();
    return revenueItem;
  }

  // Contact operations
  async getContactsByUserId(userId: number): Promise<Contact[]> {
    return await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(contacts.contactName);
  }

  async createContact(insertContact: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(insertContact).returning();
    return contact;
  }

  // Document operations
  async getDocumentsByUserId(userId: number): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.updatedAt));
  }

  async getDocumentById(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async createDocument(insertDocument: InsertDocument): Promise<Document> {
    const [document] = await db.insert(documents).values(insertDocument).returning();
    return document;
  }

  async updateDocument(id: number, title: string, content: string): Promise<Document> {
    const now = new Date();
    const [document] = await db
      .update(documents)
      .set({ title, content, updatedAt: now })
      .where(eq(documents.id, id))
      .returning();
    
    return document;
  }
}

// Replace MemStorage with DatabaseStorage
export const storage = new DatabaseStorage();
