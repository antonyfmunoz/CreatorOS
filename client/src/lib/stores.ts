import { create } from 'zustand';
import { User, AIAgent, AIChat, ChatMessage } from '@/types';

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
