export interface User {
  id: number;
  username: string;
  displayName: string;
  bio?: string;
  profileImageUrl?: string;
  role: string;
  xpPoints: number;
  level: number;
  createdAt: string;
}

export interface Post {
  id: number;
  userId: number;
  content: string;
  imageUrl?: string;
  likes: number;
  comments: number;
  createdAt: string;
  user: User;
}

export interface Comment {
  id: number;
  postId: number;
  userId: number;
  content: string;
  likes: number;
  parentId: number | null;
  createdAt: string;
  user: User;
}

export interface Product {
  id: number;
  userId: number;
  title: string;
  description: string;
  price: number;
  category: string;
  imageUrl?: string;
  rating: number;
  reviewCount: number;
  createdAt: string;
  user: User;
}

export interface AIAgent {
  id: number;
  userId: number;
  name: string;
  description: string;
  icon: string;
  iconColor: string;
  backgroundColor: string;
  systemPrompt: string;
  isCustom: boolean;
  chatCount: number;
  status: string;
  createdAt: string;
}

export interface AIChat {
  id: number;
  agentId: number;
  userId: number;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface Community {
  id: number;
  name: string;
  description: string;
  iconColor: string;
  createdAt: string;
}

export interface Channel {
  id: number;
  communityId: number;
  name: string;
  createdAt: string;
}

export interface ChannelMessage {
  id: number;
  channelId: number;
  userId: number;
  content: string;
  isPinned: boolean;
  likes: number;
  createdAt: string;
  user: User;
}

export interface Revenue {
  id: number;
  userId: number;
  amount: number;
  date: string;
  source: string;
}

export interface Contact {
  id: number;
  userId: number;
  contactName: string;
  contactImage?: string;
  purchaseInfo?: string;
  createdAt: string;
}

export interface Document {
  id: number;
  userId: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiError {
  message: string;
}
