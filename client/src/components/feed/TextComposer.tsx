import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { DialogTitle } from "@/components/ui/dialog";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPostToExpanded, setIsPostToExpanded] = useState(true);
  const [addToStory, setAddToStory] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
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
        
        onClose();
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
    
    createPostMutation.mutate({
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
      {/* Top Bar - Exactly like Instagram */}
      <div className="flex justify-between items-center px-4 py-4 border-b">
        <button 
          className="text-[15px]" 
          onClick={onClose}
        >
          Cancel
        </button>
        <h2 className="text-lg font-semibold">New post</h2>
        <button 
          className="text-blue-500 text-[15px] font-semibold"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
      
      {/* Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className="flex flex-col flex-grow overflow-y-auto"
      >
        {/* Caption Input */}
        <div className="p-4 border-b">
          <textarea
            className="bg-transparent text-lg placeholder:text-gray-400 resize-none outline-none w-full min-h-[120px]"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          ></textarea>
        </div>
        
        {/* Poll Button - EXACT MATCH */}
        <div className="p-4 pb-3">
          <button type="button" className="flex items-center gap-2.5 w-full rounded-full bg-[#F2F2F2] py-3 px-4">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 21H4.6C4.03995 21 3.75992 21 3.54601 20.891C3.35785 20.7951 3.20487 20.6422 3.10899 20.454C3 20.2401 3 19.9601 3 19.4V3M16 15V10M12 15V12M8 15V14" 
                stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Poll
          </button>
        </div>
        
        {/* Options - EXACT MATCH */}
        <div className="divide-y">
          {/* Tag people */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 18V21M17 15C17.9319 15 18.3978 15 18.7654 14.8478C19.2554 14.6448 19.6448 14.2554 19.8478 13.7654C20 13.3978 20 12.9319 20 12V6C20 5.06812 20 4.60218 19.8478 4.23463C19.6448 3.74458 19.2554 3.35523 18.7654 3.15224C18.3978 3 17.9319 3 17 3H7C6.06812 3 5.60218 3 5.23463 3.15224C4.74458 3.35523 4.35523 3.74458 4.15224 4.23463C4 4.60218 4 5.06812 4 6V12C4 12.9319 4 13.3978 4.15224 13.7654C4.35523 14.2554 4.74458 14.6448 5.23463 14.8478C5.60218 15 6.06812 15 7 15H17ZM15 9C15 10.6569 13.6569 12 12 12C10.3431 12 9 10.6569 9 9C9 7.34315 10.3431 6 12 6C13.6569 6 15 7.34315 15 9ZM17.5 21C17.5 21 17 18 12 18C7 18 6.5 21 6.5 21H17.5Z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Tag people</span>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          {/* Tag product */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="black" strokeWidth="2" />
                <path d="M3 9H21" stroke="black" strokeWidth="2" />
                <path d="M9 21V9" stroke="black" strokeWidth="2" />
              </svg>
              <span>Tag product</span>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          {/* Add location */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 12.75C13.6569 12.75 15 11.4069 15 9.75C15 8.09315 13.6569 6.75 12 6.75C10.3431 6.75 9 8.09315 9 9.75C9 11.4069 10.3431 12.75 12 12.75Z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19.5 9.75C19.5 16.5 12 21.75 12 21.75C12 21.75 4.5 16.5 4.5 9.75C4.5 7.76088 5.29018 5.85322 6.6967 4.4467C8.10322 3.04018 10.0109 2.25 12 2.25C13.9891 2.25 15.8968 3.04018 17.3033 4.4467C18.7098 5.85322 19.5 7.76088 19.5 9.75V9.75Z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Add location</span>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 18L15 12L9 6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          {/* Audience */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4552 9.50484 21.5806 11.2868C21.7168 11.5025 21.7849 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.7849 12.3897 21.7168 12.4975 21.5806 12.7132C20.4552 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Audience</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Everyone</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 18L15 12L9 6" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          
          {/* Post to header with border */}
          <div>
            <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setIsPostToExpanded(!isPostToExpanded)}>
              <span className="font-medium">Post to</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`transform transition-transform ${isPostToExpanded ? 'rotate-180' : ''}`}>
                <path d="M6 9L12 15L18 9" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            
            {isPostToExpanded && (
              <div className="space-y-5 pb-4">
                {/* X (Twitter) */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white">
                      <span className="font-bold text-sm">𝕏</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect X (Twitter)</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Facebook */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-xl font-bold">f</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect Facebook</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Instagram */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
                      <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                        <div className="w-4 h-4 border-2 rounded-full border-black"></div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect Instagram</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* TikTok */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white">
                      <span className="text-lg">♪</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect TikTok</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* YouTube */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-sm">▶</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect YouTube</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Your story - EXACT MATCH */}
                <div className="flex justify-between items-center px-5 pt-1">
                  <div className="flex items-center gap-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 4V16M12 4L7 9M12 4L17 9" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 14V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V14" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Your story</span>
                  </div>
                  <Switch 
                    checked={addToStory}
                    onCheckedChange={setAddToStory}
                    className="data-[state=checked]:bg-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Share Button - EXACT MATCH */}
      <div className="px-4 py-3 bg-white border-t mt-auto">
        <button
          className="w-full bg-black text-white text-[15px] h-[48px] rounded font-medium"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
    </div>
  );
};