import { useState, useRef } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, Users, MapPin, Eye, BarChart2, ArrowUp } from "lucide-react";

export default function NewTextPost() {
  const [content, setContent] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPostToExpanded, setIsPostToExpanded] = useState(true);
  const [addToStory, setAddToStory] = useState(false);
  const [, setLocation] = useWouterLocation();
  
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
    
    createPostMutation.mutate({
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory
    });
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Bar - Exactly like Instagram */}
      <div className="flex justify-between items-center px-4 py-4 border-b">
        <button 
          className="text-[15px]" 
          onClick={() => setLocation('/')}
        >
          Cancel
        </button>
        <h2 className="text-lg font-semibold">New post</h2>
        <div className="w-[51px]"></div>
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
        <div className="px-4 py-3">
          <button type="button" className="flex items-center gap-2.5 w-full rounded-full bg-[#F2F2F2] py-2.5 px-4">
            <BarChart2 className="h-4 w-4" />
            <span className="text-sm">Poll</span>
          </button>
        </div>
        
        {/* Options - EXACT MATCH */}
        <div className="divide-y border-t border-b">
          {/* Tag people */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4" />
              <span className="text-sm">Tag people</span>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
          
          {/* Tag product */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M3 9H21" stroke="currentColor" strokeWidth="2" />
                <path d="M9 21V9" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="text-sm">Tag product</span>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
          
          {/* Add location */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Add location</span>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
          
          {/* Audience */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4" />
              <span className="text-sm">Audience</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">Everyone</span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          
          {/* Post to header with border */}
          <div>
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setIsPostToExpanded(!isPostToExpanded)}>
              <span className="text-sm font-medium">Post to</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" className={`transform transition-transform ${isPostToExpanded ? 'rotate-180' : ''} text-gray-400`}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            
            {isPostToExpanded && (
              <div className="space-y-3 pb-2">
                {/* X (Twitter) */}
                <div className="flex justify-between items-center px-4 py-1">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-black rounded-full flex items-center justify-center text-white">
                      <span className="font-bold text-sm">𝕏</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect X (Twitter)</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-3 py-1 text-xs border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Facebook */}
                <div className="flex justify-between items-center px-4 py-1">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-lg font-bold">f</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect Facebook</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-3 py-1 text-xs border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Instagram */}
                <div className="flex justify-between items-center px-4 py-1">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
                      <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                        <div className="w-3 h-3 border-2 rounded-full border-black"></div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm">Connect Instagram</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-3 py-1 text-xs border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* TikTok */}
                <div className="flex justify-between items-center px-4 py-1">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-black rounded-full flex items-center justify-center text-white">
                      <span className="text-sm">♪</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect TikTok</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-3 py-1 text-xs border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* YouTube */}
                <div className="flex justify-between items-center px-4 py-1">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-red-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-xs">▶</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect YouTube</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-3 py-1 text-xs border border-gray-200"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Your story - EXACT MATCH */}
                <div className="flex justify-between items-center px-4 py-1 mt-1">
                  <div className="flex items-center gap-3">
                    <ArrowUp className="h-4 w-4" />
                    <span className="text-sm">Your story</span>
                  </div>
                  <Switch 
                    checked={addToStory}
                    onCheckedChange={setAddToStory}
                    className="data-[state=checked]:bg-blue-500 h-4 w-8"
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
          className="w-full bg-black text-white text-[14px] h-[40px] rounded-lg font-medium"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
    </div>
  );
}