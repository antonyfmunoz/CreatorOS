import { useState, useRef, useEffect } from 'react';
import { useAIChatStore } from '@/lib/stores';
import { ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';
import { ChatMessage } from '@/types';

// Map of icon names to colors for the chat avatar
const iconMap: Record<string, string> = {
  Pencil: 'bg-blue-500',
  Code: 'bg-purple-500',
  BarChart: 'bg-green-500',
  Image: 'bg-pink-500',
  GraduationCap: 'bg-amber-500',
};

const ChatInterface = () => {
  const { isOpen, currentAgent, messages, closeChat, addMessage, setIsTyping, isTyping } = useAIChatStore();
  const [userInput, setUserInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', '/api/ai-chat/message', {
        agentId: currentAgent?.id,
        message,
        systemPrompt: currentAgent?.systemPrompt,
      });
      return response.json();
    },
    onMutate: () => {
      setIsTyping(true);
    },
    onSuccess: (data) => {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date().toISOString(),
      };
      addMessage(assistantMessage);
      setIsTyping(false);
    },
    onError: () => {
      setIsTyping(false);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: "I'm sorry, I couldn't process your request. Please try again later.",
        timestamp: new Date().toISOString(),
      };
      addMessage(errorMessage);
    },
  });
  
  const handleSendMessage = () => {
    if (!userInput.trim() || isTyping) return;
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
    };
    
    addMessage(userMessage);
    sendMessageMutation.mutate(userInput);
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
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center">
        <Button variant="ghost" size="icon" onClick={closeChat} className="mr-4">
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h2 className="text-lg font-semibold">{currentAgent.name}</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Initial AI greeting */}
        {messages.length === 0 && (
          <div className="flex items-start">
            <div className={`w-8 h-8 rounded-full ${avatarBgColor} text-white flex items-center justify-center mr-2`}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={avatarBgColor}>
                  {currentAgent.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="bg-gray-100 rounded-lg p-3 max-w-[80%]">
              <p className="text-sm">
                Hi there! I'm your {currentAgent.name}. How can I help you today?
              </p>
            </div>
          </div>
        )}
        
        {/* Message history */}
        {messages.map((message, index) => (
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
                  ? 'bg-primary text-white' 
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
            
            {message.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-300 ml-2"></div>
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
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm text-gray-500">Thinking...</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center">
          <Input
            type="text"
            placeholder="Type your message..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus-visible:ring-primary"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={isTyping}
          />
          <Button 
            className="ml-2 p-2 rounded-lg" 
            size="icon"
            onClick={handleSendMessage}
            disabled={!userInput.trim() || isTyping}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
