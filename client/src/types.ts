import { users } from "@shared/schema";

export interface User {
  id: number;
  username: string;
  password: string;
  displayName: string;
  bio?: string | null;
  profileImageUrl?: string | null;
  role: string;
  xpPoints: number;
  level: number;
  createdAt: Date | string;
}

export interface Post {
  id: number;
  userId: number;
  content: string;
  imageUrl: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  likes: number;
  comments: number;
  createdAt: string | Date;
  user: User;
}

export interface Product {
  id: number;
  userId: number;
  title: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  createdAt: string | Date;
  user: User;
}

export interface Conversation {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdAt: string | Date;
  lastMessageAt: string | Date;
  participants: ConversationParticipant[];
}

export interface ConversationParticipant {
  id: number;
  userId: number;
  conversationId: number;
  isAdmin: boolean;
  user: User;
}

export interface Story {
  id: number;
  userId: number;
  mediaUrl: string;
  caption?: string | null;
  hasAudio?: boolean;
  viewCount: number;
  createdAt: string | Date;
  expiresAt: string | Date;
  user: User;
}