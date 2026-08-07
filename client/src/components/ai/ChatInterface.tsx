import { useState, useRef, useEffect } from 'react';
import { useAIChatStore } from '@/lib/stores';
import { ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';
import { AIChat, ChatMessage } from '@/types';
import { useAppStore } from '@/lib/stores';

// Map of icon names to colors for the chat avatar
const iconMap: Record<string, string> = {
  Pencil: 'bg-blue-500',
  Code: 'bg-purple-500',
  BarChart: 'bg-green-500',
  Image: 'bg-pink-500',
  GraduationCap: 'bg-amber-500',
};

const ChatInterface = () => {
  const { currentUser } = useAppStore();
  const {
    isOpen,
    currentAgent,
    currentChat,
    messages,
    closeChat,
    setMessages,
    setCurrentChat,
    setIsTyping,
    isTyping,
  } = useAIChatStore();
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const historyQuery = useQuery<AIChat[]>({
    queryKey: ['/api/ai-chats', currentAgent?.id, currentUser?.id],
    enabled: isOpen && !!currentAgent && !!currentUser,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/ai-chats/${currentAgent!.id}/${currentUser!.id}`);
      return response.json();
    },
  });

  useEffect(() => {
    if (!isOpen || historyQuery.data === undefined) return;
    const latestChat = historyQuery.data[0] ?? null;
    setCurrentChat(latestChat);
    setMessages(latestChat?.messages ?? []);
  }, [historyQuery.data, isOpen, setCurrentChat, setMessages]);

  const persistMessages = async (nextMessages: ChatMessage[]) => {
    if (!currentAgent) return;
    const response = currentChat
      ? await apiRequest('PUT', `/api/ai-chats/${currentChat.id}`, { messages: nextMessages })
      : await apiRequest('POST', '/api/ai-chats', { agentId: currentAgent.id, messages: nextMessages });
    const savedChat = await response.json() as AIChat;
    setCurrentChat(savedChat);
    queryClient.setQueryData<AIChat[]>(
      ['/api/ai-chats', currentAgent.id, currentUser?.id],
      (current) => [savedChat, ...(current ?? []).filter((chat) => chat.id !== savedChat.id)],
    );
    queryClient.invalidateQueries({ queryKey: ['/api/ai-agents/user', currentUser?.id] });
  };
  
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message }: { message: string; pendingMessages: ChatMessage[] }) => {
      const response = await apiRequest('POST', '/api/ai-chat/message', {
        agentId: currentAgent?.id,
        message,
      });
      return response.json();
    },
    onMutate: () => {
      setIsTyping(true);
    },
    onSuccess: async (data, variables) => {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
      };
      const nextMessages = [...variables.pendingMessages, assistantMessage];
      setMessages(nextMessages);
      setIsTyping(false);
      await persistMessages(nextMessages);
    },
    onError: async (error: Error, variables) => {
      setIsTyping(false);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: error.message || "I'm sorry, I couldn't process your request. Please try again later.",
        timestamp: new Date().toISOString(),
      };
      const nextMessages = [...variables.pendingMessages, errorMessage];
      setMessages(nextMessages);
      await persistMessages(nextMessages);
    },
  });
  
  const handleSendMessage = () => {
    if (!userInput.trim() || isTyping) return;
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
    };
    
    const pendingMessages = [...messages, userMessage];
    setMessages(pendingMessages);
    sendMessageMutation.mutate({ message: userInput, pendingMessages });
    setUserInput('');
  };
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);
  
  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };
  
  if (!isOpen || !currentAgent) return null;
  
  const avatarBgColor = iconMap[currentAgent.icon] || 'bg-blue-500';
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center border-b border-zinc-800 p-4">
        <Button variant="ghost" size="icon" onClick={closeChat} className="mr-4 text-white hover:bg-zinc-900 hover:text-white" aria-label="Close AI chat">
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h2 className="text-lg font-semibold">{currentAgent.name}</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Initial AI greeting */}
        {historyQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation...
          </div>
        ) : messages.length === 0 && (
          <div className="flex items-start">
            <div className={`w-8 h-8 rounded-full ${avatarBgColor} text-white flex items-center justify-center mr-2`}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={avatarBgColor}>
                  {currentAgent.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="max-w-[80%] rounded-2xl bg-zinc-900 p-3 text-zinc-100">
              <p className="text-sm">
                Hi there! I'm your {currentAgent.name}. How can I help you today?
              </p>
            </div>
          </div>
        )}
        
        {/* Message history */}
        {!historyQuery.isLoading && messages.map((message, index) => (
          <div 
            key={index} 
            className={`flex items-start ${message.role === 'user' ? 'justify-end' : ''}`}
          >
            {message.role === 'assistant' && (
              <div className={`w-8 h-8 rounded-full ${avatarBgColor} text-white flex items-center justify-center mr-2`}>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={avatarBgColor}>
                    {currentAgent.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            
            <div 
              className={`rounded-lg p-3 max-w-[80%] ${
                message.role === 'user' 
                  ? 'bg-[#1d9bf0] text-white'
                  : 'bg-zinc-900 text-zinc-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
            
            {message.role === 'user' && (
              <div className="ml-2 h-8 w-8 rounded-full bg-zinc-700" aria-hidden="true"></div>
            )}
          </div>
        ))}
        
        {/* AI is typing indicator */}
        {isTyping && (
          <div className="flex items-start">
            <div className={`w-8 h-8 rounded-full ${avatarBgColor} text-white flex items-center justify-center mr-2`}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={avatarBgColor}>
                  {currentAgent.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="rounded-2xl bg-zinc-900 p-3">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm text-zinc-500">Thinking...</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="border-t border-zinc-800 p-4">
        <div className="flex items-center">
          <Input
            type="text"
            placeholder="Type your message..."
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-white placeholder:text-zinc-500 focus-visible:ring-[#1d9bf0]"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isTyping}
            aria-label="AI message"
          />
          <Button 
            className="ml-2 p-2 rounded-lg" 
            size="icon"
            onClick={handleSendMessage}
            disabled={!userInput.trim() || isTyping}
            aria-label="Send AI message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
