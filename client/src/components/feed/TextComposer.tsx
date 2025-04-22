import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Loader2, 
  ChevronRight, 
  Eye, 
  BarChart2, 
  ChevronDown,
  MapPin,
  Users
} from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

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
        
        {/* Poll Button - Exactly like in the screenshot */}
        <div className="mx-4 my-3">
          <button className="w-full flex items-center justify-start rounded-full bg-[#F2F2F2] py-3 px-4">
            <BarChart2 className="h-5 w-5 mr-2.5" />
            <span>Poll</span>
          </button>
        </div>
        
        {/* Options - Exactly matching screenshot */}
        <div>
          {/* Tag people */}
          <div className="flex items-center justify-between px-5 py-[14px] border-t">
            <div className="flex items-center">
              <Users className="h-[22px] w-[22px] mr-3" />
              <span>Tag people</span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Tag product */}
          <div className="flex items-center justify-between px-5 py-[14px] border-t">
            <div className="flex items-center">
              <div className="h-[22px] w-[22px] mr-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 9H21" stroke="currentColor" strokeWidth="2" />
                  <path d="M9 21V9" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <span>Tag product</span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Add location */}
          <div className="flex items-center justify-between px-5 py-[14px] border-t">
            <div className="flex items-center">
              <MapPin className="h-[22px] w-[22px] mr-3" />
              <span>Add location</span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Audience */}
          <div className="flex items-center justify-between px-5 py-[14px] border-t">
            <div className="flex items-center">
              <Eye className="h-[22px] w-[22px] mr-3" />
              <span>Audience</span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-400 mr-2">Everyone</span>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          {/* Post to header with border */}
          <div className="border-t">
            <div className="flex items-center justify-between px-5 py-[14px] cursor-pointer" onClick={() => setIsPostToExpanded(!isPostToExpanded)}>
              <span className="font-medium">Post to</span>
              <ChevronDown className="h-5 w-5 text-gray-400" />
            </div>
            
            {isPostToExpanded && (
              <div className="space-y-4 pb-4">
                {/* X (Twitter) */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white">
                      <span className="font-bold">𝕏</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect X (Twitter)</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-300"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Facebook */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-xl font-bold">f</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect Facebook</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-300"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Instagram */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 rounded-full flex items-center justify-center">
                      <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center">
                        <div className="w-5 h-5 border-2 rounded-full border-current"></div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect Instagram</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-300"
                  >
                    Connect
                  </button>
                </div>
                
                {/* TikTok */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white">
                      <span className="text-lg">♪</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect TikTok</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-300"
                  >
                    Connect
                  </button>
                </div>
                
                {/* YouTube */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-sm">▶</span>
                    </div>
                    <div>
                      <div className="text-[15px]">Connect YouTube</div>
                      <div className="text-xs text-gray-500">Connect to share posts</div>
                    </div>
                  </div>
                  <button 
                    className="rounded-full px-4 py-1.5 text-sm border border-gray-300"
                  >
                    Connect
                  </button>
                </div>
                
                {/* Your story - exactly like in screenshot */}
                <div className="flex justify-between items-center px-5 pt-2">
                  <div className="flex items-center space-x-3">
                    {/* Instagram share icon */}
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11 5.5V15.5M11 5.5L7.33333 9.16667M11 5.5L14.6667 9.16667" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3.66667 12.8333L3.66667 15.5C3.66667 16.4205 4.41286 17.1667 5.33333 17.1667L16.6667 17.1667C17.5871 17.1667 18.3333 16.4205 18.3333 15.5L18.3333 12.8333" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Your story</span>
                  </div>
                  <Switch 
                    checked={addToStory}
                    onCheckedChange={setAddToStory}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Share Button - exactly like in the screenshot */}
      <div className="w-full py-3 px-4 bg-white border-t">
        <button
          className="w-full bg-black text-white h-12 rounded font-medium"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
    </div>
  );
};