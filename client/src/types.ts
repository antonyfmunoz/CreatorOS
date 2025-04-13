import { User } from "@shared/schema";

export interface Post {
  id: number;
  userId: number;
  content: string;
  imageUrl: string | null;
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