import { create } from 'zustand';
import { User, AIAgent, AIChat, ChatMessage, Notification, Conversation, DirectMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';

// Auth store for handling user authentication
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (userData: Partial<User> & { username: string; password: string; displayName: string }) => Promise<User>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  
  login: async (username, password) => {
    try {
      set({ isLoading: true });
      
      // For demo purposes, we're just using the first user from the list
      const response = await fetch('/api/users');
      const users = await response.json();
      
      const user = users.find((u: User) => u.username === username);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      set({ 
        user, 
        isAuthenticated: true, 
        isLoading: false 
      });
      
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  register: async (userData) => {
    try {
      set({ isLoading: true });
      
      // In a real app, we would send a POST request to register the user
      // For now, mock by returning user data
      const user = {
        id: 11, // Mock ID
        role: 'creator',
        xpPoints: 0,
        level: 1,
        createdAt: new Date().toISOString(),
        ...userData
      } as User;
      
      set({ 
        user, 
        isAuthenticated: true, 
        isLoading: false 
      });
      
      return user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  logout: () => {
    set({ 
      user: null, 
      isAuthenticated: false 
    });
  },
  
  setUser: (user) => {
    set({ 
      user, 
      isAuthenticated: !!user 
    });
  }
}));

// App state store for current active tab, user, etc.
interface AppState {
  activeTab: 'explore' | 'marketplace' | 'ai' | 'communities' | 'profile';
  currentUser: User | null;
  isLoading: boolean;
  setActiveTab: (tab: 'explore' | 'marketplace' | 'ai' | 'communities' | 'profile') => void;
  setCurrentUser: (user: User | null) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'explore',
  currentUser: null,
  isLoading: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setIsLoading: (isLoading) => set({ isLoading }),
}));

// AI Chat store for handling the chat interface
interface AIChatState {
  isOpen: boolean;
  currentAgent: AIAgent | null;
  currentChat: AIChat | null;
  messages: ChatMessage[];
  isTyping: boolean;
  openChat: (agent: AIAgent) => void;
  closeChat: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  setIsTyping: (isTyping: boolean) => void;
  setCurrentChat: (chat: AIChat | null) => void;
}

export const useAIChatStore = create<AIChatState>((set) => ({
  isOpen: false,
  currentAgent: null,
  currentChat: null,
  messages: [],
  isTyping: false,
  openChat: (agent) => set({ isOpen: true, currentAgent: agent, messages: [] }),
  closeChat: () => set({ isOpen: false, currentAgent: null, currentChat: null, messages: [] }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setIsTyping: (isTyping) => set({ isTyping }),
  setCurrentChat: (chat) => set({ currentChat: chat }),
}));

// Communities store for handling the communities tab
interface CommunitiesState {
  activeCommunityId: number | null;
  activeChannelId: number | null;
  setActiveCommunity: (id: number | null) => void;
  setActiveChannel: (id: number | null) => void;
}

export const useCommunitiesStore = create<CommunitiesState>((set) => ({
  activeCommunityId: 1, // Default to first community
  activeChannelId: 1, // Default to first channel
  setActiveCommunity: (id) => set({ activeCommunityId: id }),
  setActiveChannel: (id) => set({ activeChannelId: id }),
}));

// Theme store
interface ThemeState {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDarkMode: false,
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
}));

// Notification store for managing notifications
interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isNotificationPanelOpen: boolean;
  fetchNotifications: (userId: number) => Promise<void>;
  createNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: number) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllNotifications: (userId: number) => Promise<void>;
  toggleNotificationPanel: () => void;
  closeNotificationPanel: () => void;
}

export const useNotifications = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isNotificationPanelOpen: false,
  
  fetchNotifications: async (userId: number) => {
    try {
      set({ isLoading: true });
      const response = await fetch(`/api/users/${userId}/notifications`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      
      const data = await response.json();
      
      set({
        notifications: data,
        unreadCount: data.filter((n: Notification) => !n.read).length,
        isLoading: false
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      set({ isLoading: false });
    }
  },
  
  createNotification: async (notification) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...notification,
          read: false
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create notification');
      }
      
      const newNotification = await response.json();
      
      set((state) => ({
        notifications: [newNotification, ...state.notifications],
        unreadCount: state.unreadCount + 1
      }));
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  },
  
  markAsRead: async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}/mark-read`, {
        method: 'PATCH'
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }
      
      const updatedNotification = await response.json();
      
      set((state) => {
        const updatedNotifications = state.notifications.map(notification => 
          notification.id === id ? { ...notification, read: true } : notification
        );
        
        return {
          notifications: updatedNotifications,
          unreadCount: updatedNotifications.filter(n => !n.read).length
        };
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  },
  
  markAllAsRead: async (userId: number) => {
    try {
      const response = await fetch(`/api/users/${userId}/notifications/mark-all-read`, {
        method: 'PATCH'
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }
      
      set((state) => ({
        notifications: state.notifications.map(notification => ({ ...notification, read: true })),
        unreadCount: 0
      }));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  },
  
  deleteNotification: async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }
      
      set((state) => {
        const notification = state.notifications.find(n => n.id === id);
        const unreadCount = notification && !notification.read 
          ? state.unreadCount - 1 
          : state.unreadCount;
        
        return {
          notifications: state.notifications.filter(n => n.id !== id),
          unreadCount: Math.max(0, unreadCount)
        };
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  },
  
  deleteAllNotifications: async (userId: number) => {
    try {
      const response = await fetch(`/api/users/${userId}/notifications`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete all notifications');
      }
      
      set({
        notifications: [],
        unreadCount: 0
      });
    } catch (error) {
      console.error('Error deleting all notifications:', error);
    }
  },
  
  toggleNotificationPanel: () => set((state) => ({
    isNotificationPanelOpen: !state.isNotificationPanelOpen
  })),
  
  closeNotificationPanel: () => set({
    isNotificationPanelOpen: false
  })
}));

// Messaging store for handling direct messages and conversations
interface MessagingState {
  conversations: Conversation[];
  messages: DirectMessage[];
  isLoading: boolean;
  selectedConversation: number | null;
  isMessagePanelOpen: boolean;
  editingMessageId: number | null;
  replyingToMessage: DirectMessage | null;
  fetchConversations: (userId: number) => Promise<void>;
  fetchMessages: (conversationId: number) => Promise<void>;
  sendMessage: (conversationId: number, senderId: number, content: string, replyToMessageId?: number | null) => Promise<void>;
  editMessage: (messageId: number, newContent: string) => Promise<void>;
  deleteMessage: (messageId: number) => Promise<void>;
  deleteConversation: (conversationId: number) => Promise<void>;
  reactToMessage: (messageId: number, userId: number, reaction: string) => Promise<void>;
  markConversationAsRead: (conversationId: number) => Promise<void>;
  createConversation: (userIds: number[], name?: string) => Promise<number>;
  setSelectedConversation: (conversationId: number | null) => void;
  setEditingMessageId: (messageId: number | null) => void;
  setReplyingToMessage: (message: DirectMessage | null) => void;
  toggleMessagePanel: () => void;
  closeMessagePanel: () => void;
}

export const useMessaging = create<MessagingState>((set, get) => ({
  conversations: [],
  messages: [],
  isLoading: false,
  selectedConversation: null,
  isMessagePanelOpen: false,
  editingMessageId: null,
  replyingToMessage: null,
  
  fetchConversations: async (userId: number) => {
    try {
      set({ isLoading: true });
      const response = await fetch(`/api/users/${userId}/conversations`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const data = await response.json();
      
      set({
        conversations: data,
        isLoading: false
      });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      set({ isLoading: false });
    }
  },
  
  fetchMessages: async (conversationId: number) => {
    try {
      set({ isLoading: true });
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      
      const data = await response.json();
      
      set({
        messages: data,
        isLoading: false
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      set({ isLoading: false });
    }
  },
  
  sendMessage: async (conversationId: number, senderId: number, content: string, replyToMessageId = null) => {
    try {
      const response = await fetch(`/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          senderId,
          content,
          read: false,
          replyToMessageId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      const newMessage = await response.json();
      
      set((state) => ({
        messages: [...state.messages, newMessage],
        replyingToMessage: null // Clear the replying state after sending
      }));
      
      // Update conversation with new last message
      await get().fetchConversations(senderId);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  },
  
  editMessage: async (messageId: number, newContent: string) => {
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent,
          isEdited: true
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to edit message');
      }
      
      const updatedMessage = await response.json();
      
      set((state) => ({
        messages: state.messages.map(msg => 
          msg.id === messageId ? updatedMessage : msg
        ),
        editingMessageId: null // Clear editing state after saving
      }));
      
      // Update conversations to show latest message content if it was edited
      const { user } = useAuthStore.getState();
      if (user) {
        await get().fetchConversations(user.id);
      }
    } catch (error) {
      console.error('Error editing message:', error);
    }
  },
  
  deleteMessage: async (messageId: number) => {
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete message');
      }
      
      set((state) => ({
        messages: state.messages.filter(msg => msg.id !== messageId)
      }));
      
      // Update conversations list to reflect the deletion
      const { user } = useAuthStore.getState();
      if (user) {
        await get().fetchConversations(user.id);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  },
  
  deleteConversation: async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }
      
      set((state) => ({
        conversations: state.conversations.filter(conv => conv.id !== conversationId),
        selectedConversation: state.selectedConversation === conversationId ? null : state.selectedConversation
      }));
      
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  },
  
  reactToMessage: async (messageId: number, userId: number, reaction: string) => {
    try {
      const response = await fetch(`/api/messages/${messageId}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          reaction
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to add reaction');
      }
      
      const updatedMessage = await response.json();
      
      set((state) => ({
        messages: state.messages.map(msg => 
          msg.id === messageId ? updatedMessage : msg
        )
      }));
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  },
  
  markConversationAsRead: async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/mark-read`, {
        method: 'PATCH'
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark conversation as read');
      }
      
      // Update conversations to reflect read status
      const { user } = useAuthStore.getState();
      if (user) {
        await get().fetchConversations(user.id);
      }
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }
  },
  
  createConversation: async (userIds: number[], name?: string) => {
    try {
      console.log('Creating conversation with userIds:', userIds, 'name:', name);
      
      // Make sure userIds is an array and contains at least 2 members
      if (!Array.isArray(userIds) || userIds.length < 2) {
        console.error('Invalid userIds provided. Need at least 2 users in an array:', userIds);
        throw new Error('At least two users required for a conversation');
      }
      
      // Check all userIds are numbers
      if (!userIds.every(id => typeof id === 'number')) {
        console.error('All userIds must be numbers:', userIds);
        throw new Error('All user IDs must be numbers');
      }
      
      // If this is a direct message (only 2 users and no name), check if conversation already exists
      if (userIds.length === 2 && !name) {
        const { user } = useAuthStore.getState();
        if (user) {
          // Ensure we have the latest conversations
          await get().fetchConversations(user.id);
          const { conversations } = get();
          
          // For direct messages, find a non-group conversation that has exactly these two users
          const existingConversation = conversations.find(conv => {
            // If it's a group chat, skip it
            if (conv.isGroup) return false;
            
            // Check if conversation has exactly these two participants and participants array exists
            if (!conv.participants) return false;
            
            const participantIds = conv.participants.map(p => p.userId);
            return (
              participantIds.length === 2 && 
              participantIds.includes(userIds[0]) && 
              participantIds.includes(userIds[1])
            );
          });
          
          if (existingConversation) {
            console.log('Found existing conversation:', existingConversation.id);
            // Update the client-side conversations to include this conversation
            get().setSelectedConversation(existingConversation.id);
            return existingConversation.id;
          }
        }
      }
      
      // Pass the same userIds and parameters to the server
      // The server will check again for existing conversations to prevent race conditions
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds,
          name,
          isGroup: userIds.length > 2 || !!name
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response error:', response.status, errorText);
        throw new Error(`Failed to create conversation: ${response.status} ${errorText}`);
      }
      
      const newConversation = await response.json();
      console.log('Created conversation:', newConversation);
      
      // Update conversations list
      const { user } = useAuthStore.getState();
      if (user) {
        await get().fetchConversations(user.id);
      }
      
      return newConversation.id;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  },
  
  setSelectedConversation: (conversationId) => set({ selectedConversation: conversationId }),
  
  toggleMessagePanel: () => set((state) => ({
    isMessagePanelOpen: !state.isMessagePanelOpen
  })),
  
  closeMessagePanel: () => set({
    isMessagePanelOpen: false
  }),
  
  setEditingMessageId: (messageId) => set({ 
    editingMessageId: messageId 
  }),
  
  setReplyingToMessage: (message) => set({ 
    replyingToMessage: message 
  })
}));
