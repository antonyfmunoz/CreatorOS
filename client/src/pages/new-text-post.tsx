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
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Top Bar - Header */}
      <div className="flex justify-between items-center px-4 py-4 border-b flex-shrink-0">
        <button 
          className="text-[15px]" 
          onClick={() => setLocation('/')}
        >
          Cancel
        </button>
        <h2 className="text-lg font-semibold">New post</h2>
        <div className="w-[51px]"></div>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-col overflow-y-auto flex-1">
        {/* Caption Input */}
        <div className="p-4 border-b">
          <textarea
            className="bg-transparent text-lg placeholder:text-gray-400 resize-none outline-none w-full min-h-[120px]"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          ></textarea>
        </div>
        
        {/* Poll Input Bar */}
        <div className="px-4 py-3">
          <input 
            type="text" 
            placeholder="Poll" 
            className="w-full px-4 py-3 rounded-full border border-gray-200 text-sm"
          />
        </div>
        
        {/* Menu Section */}
        <div className="px-4 py-2">
          <hr className="border-t border-gray-100 mb-3" />
          
          <div className="flex flex-col gap-3">
            {/* Tag people */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm">👤 Tag people</span>
              <span className="text-gray-400 text-sm">›</span>
            </div>
            
            {/* Tag product */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm">🛍️ Tag product</span>
              <span className="text-gray-400 text-sm">›</span>
            </div>
            
            {/* Add location */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm">📍 Add location</span>
              <span className="text-gray-400 text-sm">›</span>
            </div>
            
            {/* Audience */}
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm">👁 Audience</span>
              <span className="text-gray-400 text-sm">Everyone</span>
            </div>
          </div>
        </div>
        
        {/* Post to section */}
        <div className="px-4 py-2">
          <h3 className="text-sm font-semibold mb-3">Post to</h3>
          
          <div className="flex flex-col gap-3">
            {/* X (Twitter) */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold">X</span>
                <span className="text-sm">
                  Connect X (Twitter)<br/>
                  <small className="text-[10px] text-gray-500">Connect to share posts</small>
                </span>
              </div>
              <button className="rounded-full px-3 py-0.5 text-xs border border-gray-200">
                Connect
              </button>
            </div>
            
            {/* Facebook */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">f</span>
                <span className="text-sm">
                  Connect Facebook<br/>
                  <small className="text-[10px] text-gray-500">Connect to share posts</small>
                </span>
              </div>
              <button className="rounded-full px-3 py-0.5 text-xs border border-gray-200">
                Connect
              </button>
            </div>
            
            {/* Instagram */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs">📷</span>
                <span className="text-sm">
                  Connect Instagram<br/>
                  <small className="text-[10px] text-gray-500">Connect to share posts</small>
                </span>
              </div>
              <button className="rounded-full px-3 py-0.5 text-xs border border-gray-200">
                Connect
              </button>
            </div>
            
            {/* TikTok */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white text-xs">🎵</span>
                <span className="text-sm">
                  Connect TikTok<br/>
                  <small className="text-[10px] text-gray-500">Connect to share posts</small>
                </span>
              </div>
              <button className="rounded-full px-3 py-0.5 text-xs border border-gray-200">
                Connect
              </button>
            </div>
            
            {/* YouTube */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center text-white text-xs font-bold">YT</span>
                <span className="text-sm">
                  Connect YouTube<br/>
                  <small className="text-[10px] text-gray-500">Connect to share posts</small>
                </span>
              </div>
              <button className="rounded-full px-3 py-0.5 text-xs border border-gray-200">
                Connect
              </button>
            </div>
          </div>
        
          {/* Your story toggle */}
          <div className="flex justify-between items-center mt-4 py-3">
            <span className="text-sm">📤 Your story</span>
            <Switch 
              checked={addToStory}
              onCheckedChange={setAddToStory}
              className="data-[state=checked]:bg-black h-4 w-7"
            />
          </div>
        </div>
      </div>
      
      {/* Share Button */}
      <div className="px-4 py-3 bg-white border-t flex-shrink-0">
        <button
          className="w-full bg-black text-white text-[14px] h-[38px] rounded-md font-medium"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
    </div>
  );
}