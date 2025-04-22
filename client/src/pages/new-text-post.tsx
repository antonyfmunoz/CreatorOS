import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { ChevronRight } from "lucide-react";

export default function NewTextPost() {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  const [, setLocation] = useWouterLocation();
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const createPostMutation = useMutation({
    mutationFn: async (postData: any) => {
      const res = await apiRequest('POST', '/api/posts', postData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post created!',
        description: 'Your post has been successfully shared.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      if (addToStory) {
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
      }
      
      setLocation('/');
    },
    onError: (error) => {
      console.error('Error creating post:', error);
      toast({
        title: 'Error',
        description: 'Failed to create post. Please try again.',
        variant: 'destructive'
      });
    }
  });
  
  const handleSubmit = () => {
    if (!content.trim()) {
      toast({
        title: "Cannot Post",
        description: "Your post cannot be empty",
        variant: "destructive"
      });
      return;
    }
    
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to create a post.',
        variant: 'destructive'
      });
      return;
    }
    
    createPostMutation.mutate({
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory
    });
  };

  return (
    <div className="flex flex-col h-screen bg-white max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2.5 border-b">
        <button 
          className="text-xl" 
          onClick={() => setLocation('/')}
        >
          ✕
        </button>
        <span className="font-semibold">New post</span>
        <div className="w-4"></div>
      </div>
      
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Caption Input */}
        <div className="p-4 border-b">
          <textarea
            className="w-full h-20 text-base resize-none outline-none"
            placeholder="Write a caption..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          ></textarea>
        </div>
        
        {/* Poll Button */}
        <div className="p-4 border-b">
          <button className="flex items-center justify-center gap-2 rounded-full py-2.5 px-4 bg-gray-50 w-full">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20V12M10 20V4M16 20V12M22 20V4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-sm">Poll</span>
          </button>
        </div>
        
        {/* Tag people */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 20C4 17.7909 5.79086 16 8 16H16C18.2091 16 20 17.7909 20 20" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Tag people</span>
          </div>
          <ChevronRight size={18} />
        </div>
        
        {/* Tag product */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="1" stroke="black" strokeWidth="1.5"/>
              <path d="M9 3V21" stroke="black" strokeWidth="1.5"/>
              <path d="M3 9H21" stroke="black" strokeWidth="1.5"/>
            </svg>
            <span>Tag product</span>
          </div>
          <ChevronRight size={18} />
        </div>
        
        {/* Add location */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 21.25C12 21.25 19.5 15.75 19.5 9.75C19.5 7.76088 18.7098 5.85322 17.3033 4.4467C15.8968 3.04018 13.9891 2.25 12 2.25C10.0109 2.25 8.10322 3.04018 6.6967 4.4467C5.29018 5.85322 4.5 7.76088 4.5 9.75C4.5 15.75 12 21.25 12 21.25Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 12.75C13.6569 12.75 15 11.4069 15 9.75C15 8.09315 13.6569 6.75 12 6.75C10.3431 6.75 9 8.09315 9 9.75C9 11.4069 10.3431 12.75 12 12.75Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Add location</span>
          </div>
          <ChevronRight size={18} />
        </div>
        
        {/* Audience */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4552 9.50484 21.5806 11.2868C21.7168 11.5025 21.7849 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.7849 12.3897 21.7168 12.4975 21.5806 12.7132C20.4552 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Audience</span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-500 text-sm mr-1">Everyone</span>
            <ChevronRight size={18} />
          </div>
        </div>
        
        {/* Post to section */}
        <div className="border-b">
          <div className="flex items-center justify-between p-4">
            <span className="font-semibold">Post to</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="rotate-180">
              <path d="M6 9L12 15L18 9" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          {/* X (Twitter) */}
          <div className="flex justify-between items-center p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-semibold">X</span>
              </div>
              <div>
                <div className="text-[13px]">Connect X (Twitter)</div>
                <div className="text-[11px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button className="bg-transparent border border-gray-200 rounded text-[13px] px-2 py-1">
              Connect
            </button>
          </div>
          
          {/* Facebook */}
          <div className="flex justify-between items-center p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">f</span>
              </div>
              <div>
                <div className="text-[13px]">Connect Facebook</div>
                <div className="text-[11px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button className="bg-transparent border border-gray-200 rounded text-[13px] px-2 py-1">
              Connect
            </button>
          </div>
          
          {/* Instagram */}
          <div className="flex justify-between items-center p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full border-[1.5px] border-black"></div>
                </div>
              </div>
              <div>
                <div className="text-[13px]">Connect Instagram</div>
                <div className="text-[11px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button className="bg-transparent border border-gray-200 rounded text-[13px] px-2 py-1">
              Connect
            </button>
          </div>
          
          {/* TikTok */}
          <div className="flex justify-between items-center p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                <span className="text-white text-xs">♪</span>
              </div>
              <div>
                <div className="text-[13px]">Connect TikTok</div>
                <div className="text-[11px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button className="bg-transparent border border-gray-200 rounded text-[13px] px-2 py-1">
              Connect
            </button>
          </div>
          
          {/* YouTube */}
          <div className="flex justify-between items-center p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">▶</span>
              </div>
              <div>
                <div className="text-[13px]">Connect YouTube</div>
                <div className="text-[11px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button className="bg-transparent border border-gray-200 rounded text-[13px] px-2 py-1">
              Connect
            </button>
          </div>
        </div>
        
        {/* Your story */}
        <div className="flex justify-between items-center p-4">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4V16M12 4L7 9M12 4L17 9" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 14V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V14" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Your story</span>
          </div>
          <Switch 
            checked={addToStory}
            onCheckedChange={setAddToStory}
            className="data-[state=checked]:bg-blue-500"
          />
        </div>
        
        {/* Extra padding for bottom button */}
        <div className="h-14"></div>
      </div>
      
      {/* Share Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t">
        <button
          className="w-full bg-black text-white py-3 rounded-none font-medium text-sm"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
    </div>
  );
}