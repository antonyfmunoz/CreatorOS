import { db } from "../server/db";
import { users, posts, products, aiAgents, communities, channels, channelMessages, contacts, documents } from "../shared/schema";

async function seedDatabase() {
  console.log("Seeding database...");

  try {
    // Clear existing data
    // Note: Due to foreign key constraints, we need to delete in reverse order
    await db.delete(documents);
    await db.delete(contacts);
    await db.delete(channelMessages);
    await db.delete(channels);
    await db.delete(communities);
    await db.delete(aiAgents);
    await db.delete(products);
    await db.delete(posts);
    await db.delete(users);

    console.log("Database cleared. Adding sample data...");

    // Create users
    const [user1] = await db.insert(users).values({
      username: 'johndoe',
      password: 'password123',
      displayName: 'John Doe',
      bio: 'Digital Creator & Entrepreneur',
      profileImageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e',
      role: 'creator',
      xpPoints: 0,
      level: 1,
    }).returning();

    const [user2] = await db.insert(users).values({
      username: 'sarahmitchell',
      password: 'password123',
      displayName: 'Sarah Mitchell',
      bio: 'Marketing Expert',
      profileImageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
      role: 'creator',
      xpPoints: 0,
      level: 1,
    }).returning();

    const [user3] = await db.insert(users).values({
      username: 'davidkim',
      password: 'password123',
      displayName: 'David Kim',
      bio: 'Web Developer',
      profileImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
      role: 'creator',
      xpPoints: 0,
      level: 1,
    }).returning();

    const [user4] = await db.insert(users).values({
      username: 'emmathompson',
      password: 'password123',
      displayName: 'Emma Thompson',
      bio: 'UX Designer',
      profileImageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
      role: 'creator',
      xpPoints: 0,
      level: 1,
    }).returning();

    const [user5] = await db.insert(users).values({
      username: 'michaeljones',
      password: 'password123',
      displayName: 'Michael Jones',
      bio: 'Social Media Marketing',
      profileImageUrl: 'https://images.unsplash.com/photo-1603415526960-f7e0328c63b1',
      role: 'creator',
      xpPoints: 0,
      level: 1,
    }).returning();

    console.log("Users created");

    // Create posts
    await db.insert(posts).values([
      {
        userId: user2.id,
        content: 'Just launched my new course on content marketing strategy! Check it out in the marketplace 🚀',
        imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978',
        likes: 0,
        comments: 0,
      },
      {
        userId: user3.id,
        content: 'Hosting a free webinar tomorrow on "Building Scalable React Applications" - Join our community to participate!',
        imageUrl: null,
        likes: 0,
        comments: 0,
      },
      {
        userId: user4.id,
        content: 'I just wrapped up my latest UI design system. Excited to share what I\'ve learned!',
        imageUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5',
        likes: 0,
        comments: 0,
      },
    ]);

    console.log("Posts created");

    // Create products
    await db.insert(products).values([
      {
        userId: user2.id,
        title: 'Content Marketing Mastery',
        description: 'A comprehensive guide to content marketing strategy',
        price: 49.99,
        category: 'Course',
        imageUrl: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40',
        rating: 0,
        reviewCount: 0,
      },
      {
        userId: user5.id,
        title: 'Productivity Planner',
        description: 'Boost your productivity with this custom planner',
        price: 19.99,
        category: 'Template',
        imageUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643',
        rating: 0,
        reviewCount: 0,
      },
      {
        userId: user3.id,
        title: 'Web Development Bootcamp',
        description: 'Learn modern web development from scratch',
        price: 89.99,
        category: 'Course',
        imageUrl: 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b',
        rating: 0,
        reviewCount: 0,
      },
    ]);

    console.log("Products created");

    // Create AI agents
    await db.insert(aiAgents).values([
      {
        userId: user1.id,
        name: 'Content Assistant',
        description: 'Writes blog posts, social media captions, and email copy',
        icon: 'Pencil',
        iconColor: 'text-primary',
        backgroundColor: 'bg-blue-100',
        systemPrompt: 'You are a content assistant specializing in writing engaging copy for various formats.',
        isCustom: false,
        chatCount: 0,
        status: 'active',
      },
      {
        userId: user1.id,
        name: 'Code Helper',
        description: 'Assists with programming tasks and debugging',
        icon: 'Code',
        iconColor: 'text-secondary',
        backgroundColor: 'bg-purple-100',
        systemPrompt: 'You are a programming assistant that helps with code, debugging, and technical questions.',
        isCustom: false,
        chatCount: 0,
        status: 'active',
      },
    ]);

    console.log("AI agents created");

    // Create communities
    const [community1] = await db.insert(communities).values({
      name: 'Web Developers',
      description: 'A community for web developers to share knowledge and resources',
      iconColor: 'bg-green-500',
    }).returning();

    const [community2] = await db.insert(communities).values({
      name: 'Content Creators',
      description: 'For content creators across all platforms',
      iconColor: 'bg-yellow-500',
    }).returning();

    console.log("Communities created");

    // Create channels
    const [channel1] = await db.insert(channels).values({
      communityId: community1.id,
      name: 'general',
    }).returning();

    await db.insert(channels).values([
      {
        communityId: community1.id,
        name: 'frontend',
      },
      {
        communityId: community1.id,
        name: 'backend',
      },
    ]);

    console.log("Channels created");

    // Create channel messages
    await db.insert(channelMessages).values([
      {
        channelId: channel1.id,
        userId: user3.id,
        content: 'Hey everyone! I just published a new tutorial on building React components with TypeScript. Check it out!',
        isPinned: false,
        likes: 0,
      },
      {
        channelId: channel1.id,
        userId: user4.id,
        content: 'Thanks for sharing, David! I\'ve been looking for good TypeScript resources.',
        isPinned: false,
        likes: 0,
      },
    ]);

    console.log("Channel messages created");

    // Create contacts
    await db.insert(contacts).values([
      {
        userId: user1.id,
        contactName: 'Sarah Mitchell',
        contactImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
        purchaseInfo: 'Purchased: Content Marketing Course',
      },
      {
        userId: user1.id,
        contactName: 'David Kim',
        contactImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
        purchaseInfo: 'Purchased: Web Development Bootcamp',
      },
    ]);

    console.log("Contacts created");

    // Create document
    await db.insert(documents).values({
      userId: user1.id,
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

    console.log("Documents created");

    console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    process.exit(0);
  }
}

seedDatabase();