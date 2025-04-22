import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";

export default function NewTextPost() {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  const [, setLocation] = useWouterLocation();
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Define mutation outside the function to avoid React Hook errors
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
    <div className="flex flex-col h-screen bg-white max-w-[420px] mx-auto border border-gray-200">
      {/* Header */}
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
      
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Text Input */}
        <div className="p-4 border-b">
          <textarea
            className="w-full min-h-[120px] text-base resize-none outline-none"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          ></textarea>
        </div>
        
        {/* Poll */}
        <div className="section flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <span className="text-[15px]">Poll</span>
          </div>
        </div>
        
        {/* Tag people */}
        <div className="section flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-lg">🧑‍🤝‍🧑</span>
            <span className="text-[15px]">Tag people</span>
          </div>
          <span className="text-gray-400">›</span>
        </div>
        
        {/* Tag product */}
        <div className="section flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-lg">🛍️</span>
            <span className="text-[15px]">Tag product</span>
          </div>
          <span className="text-gray-400">›</span>
        </div>
        
        {/* Add location */}
        <div className="section flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-lg">📍</span>
            <span className="text-[15px]">Add location</span>
          </div>
          <span className="text-gray-400">›</span>
        </div>
        
        {/* Audience */}
        <div className="section flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-lg">👁️</span>
            <span className="text-[15px]">Audience</span>
          </div>
          <span className="text-gray-500">Everyone</span>
        </div>
        
        {/* Post to header */}
        <div className="section px-4 py-3 border-b border-gray-100 font-semibold">
          Post to
        </div>
        
        {/* Twitter */}
        <div className="platforms flex justify-between items-center px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-full bg-black flex items-center justify-center">
              <span className="text-white text-xs font-bold">X</span>
            </div>
            <div>
              <div className="text-[15px]">Connect X (Twitter)</div>
              <small className="text-xs text-gray-500">Connect to share posts</small>
            </div>
          </div>
          <button className="px-3.5 py-1.5 bg-gray-100 rounded-lg text-sm">Connect</button>
        </div>
        
        {/* Facebook */}
        <div className="platforms flex justify-between items-center px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">f</span>
            </div>
            <div>
              <div className="text-[15px]">Connect Facebook</div>
              <small className="text-xs text-gray-500">Connect to share posts</small>
            </div>
          </div>
          <button className="px-3.5 py-1.5 bg-gray-100 rounded-lg text-sm">Connect</button>
        </div>
        
        {/* Instagram */}
        <div className="platforms flex justify-between items-center px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400">
              <div className="w-full h-full rounded-full border-[1.5px] border-white flex items-center justify-center">
                <div className="w-[10px] h-[10px] rounded-full border-[1.5px] border-white"></div>
              </div>
            </div>
            <div>
              <div className="text-[15px]">Connect Instagram</div>
              <small className="text-xs text-gray-500">Connect to share posts</small>
            </div>
          </div>
          <button className="px-3.5 py-1.5 bg-gray-100 rounded-lg text-sm">Connect</button>
        </div>
        
        {/* TikTok */}
        <div className="platforms flex justify-between items-center px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-full bg-black flex items-center justify-center">
              <span className="text-white text-xs">♪</span>
            </div>
            <div>
              <div className="text-[15px]">Connect TikTok</div>
              <small className="text-xs text-gray-500">Connect to share posts</small>
            </div>
          </div>
          <button className="px-3.5 py-1.5 bg-gray-100 rounded-lg text-sm">Connect</button>
        </div>
        
        {/* YouTube */}
        <div className="platforms flex justify-between items-center px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-[26px] h-[26px] rounded-full bg-red-600 flex items-center justify-center">
              <span className="text-white text-xs">▶</span>
            </div>
            <div>
              <div className="text-[15px]">Connect YouTube</div>
              <small className="text-xs text-gray-500">Connect to share posts</small>
            </div>
          </div>
          <button className="px-3.5 py-1.5 bg-gray-100 rounded-lg text-sm">Connect</button>
        </div>
        
        {/* Your story */}
        <div className="flex justify-between items-center px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="text-lg">📤</span>
            <span className="text-[15px]">Your story</span>
          </div>
          <Switch 
            checked={addToStory}
            onCheckedChange={setAddToStory}
            className="data-[state=checked]:bg-black h-[22px] w-[38px]"
          />
        </div>
      </div>
      
      {/* Share Button */}
      <div className="mt-auto">
        <button
          className="w-full bg-black text-white py-3.5 font-bold text-base"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
    </div>
  );
}