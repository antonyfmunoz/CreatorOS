export interface User {
  id: number;
  username: string;
  displayName: string;
  bio?: string | null;
  profileLinks?: Array<{ label: string; url: string }>;
  pushNotificationsEnabled?: boolean;
  colorMode?: string;
  profileImageUrl?: string | null;
  role: string;
  xpPoints: number;
  level: number;
  createdAt: string | Date;
}

export interface TaggedUser {
  id: number;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  positionX: number;
  positionY: number;
}

export interface Post {
  id: number;
  userId: number;
  content: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  mediaAssetId?: string | null;
  location?: string | null;
  mediaType?: string;
  repostOfId?: number | null;
  likes: number;
  comments: number;
  createdAt: string;
  user: User;
  taggedUsers?: TaggedUser[];
  discovery?: {
    rank: number;
    score: number;
    explanation: string[];
    policyVersion: number;
  };
}

export interface Comment {
  id: number;
  postId: number;
  userId: number;
  content: string;
  visibility: "public" | "held" | "removed";
  likes: number;
  parentId: number | null;
  createdAt: string;
  user: User;
}

export interface Product {
  id: number;
  userId: number;
  businessId?: string | null;
  payoutMode: "platform" | "creator";
  status: "draft" | "published" | "archived";
  productType: "digital_download" | "course" | "community" | "membership";
  billingModel: "one_time" | "recurring";
  billingInterval?: "month" | "year" | null;
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

export interface Purchase {
  id: number;
  buyerId: number;
  productId: number;
  status: string;
  paymentProvider: string;
  purchasedAt: string;
  product: Product;
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
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface Community {
  id: number;
  name: string;
  description: string;
  iconColor: string;
  createdAt: string;
  accessProductId?: number | null;
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
  parentMessageId: number | null;
  content: string;
  isPinned: boolean;
  likes: number;
  likedByCurrentUser?: boolean;
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

export interface Notification {
  id: string;
  type: "like" | "comment" | "mention" | "follow" | "purchase" | "system";
  message: string;
  read: boolean;
  createdAt: string;
  linkTo?: string;
  relatedUserId?: number;
  relatedUserImage?: string;
}

export interface Conversation {
  id: number;
  createdAt: string;
  updatedAt: string;
  isGroup: boolean;
  name?: string;
  icon?: string;
  participants?: ConversationParticipant[];
  lastMessage?: DirectMessage;
  unreadCount?: number;
}

export interface ConversationParticipant {
  id: number;
  conversationId: number;
  userId: number;
  isAdmin: boolean;
  joinedAt: string;
  user?: User;
}

export interface DirectMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string;
  read: boolean;
  sentAt: string;
  sender?: User;
  isEdited?: boolean;
  replyToMessageId?: number | null;
  replyToMessage?: DirectMessage | null;
  reactions?: Record<string, number>; // Store reactions like { "❤️": 3, "👍": 2 }
  clientMutationId?: string | null;
  deliveryState?: "queued" | "sent";
}

export interface Story {
  id: number;
  userId: number;
  mediaUrl: string;
  mediaType: string;
  caption?: string;
  expiresAt: string;
  createdAt: string;
  viewCount: number;
  user: User;
  hasAudio?: boolean;
}
