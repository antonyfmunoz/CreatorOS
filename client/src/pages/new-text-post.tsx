import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { BarChart2 } from "lucide-react";
import { PollCreator } from "@/components/feed/PollCreator";

export default function NewTextPost() {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [pollData, setPollData] = useState<any>(null);
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
    
    const postData = {
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory,
      // Include poll data if it exists
      ...(pollData && { pollData })
    };
    
    console.log("Submitting post:", postData);
    createPostMutation.mutate(postData);
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2.5 border-b">
        <button 
          className="text-xl" 
          onClick={() => setLocation('/')}
        >
          ✕
        </button>
        <span className="font-semibold">New post</span>
        <div className="w-5"></div>
      </div>
      
      {/* All content */}
      <div>
        {/* Caption Input */}
        <div className="p-4 border-b">
          <textarea
            className="w-full h-20 text-base resize-none outline-none"
            placeholder="Write a caption..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          ></textarea>
        </div>
        
        {/* Poll Button - Exactly matching the PhotoUploader.tsx line 628 */}
        <div className="p-4 space-y-4 border-b">
          {pollData ? (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium">Poll: {pollData.question}</h3>
                <button 
                  className="text-red-500"
                  onClick={() => setPollData(null)}
                >
                  Remove
                </button>
              </div>
              <div className="space-y-2">
                {pollData.options.map((option: string, i: number) => (
                  <div key={i} className="bg-muted p-2 rounded-md">{option}</div>
                ))}
              </div>
            </div>
          ) : (
            <button 
              type="button"
              className="flex items-center justify-center gap-2 w-full h-[38px] px-4 py-2 rounded-full border border-gray-300 cursor-pointer bg-transparent"
              onClick={() => {
                console.log("Opening poll modal");
                setIsPollModalOpen(true);
              }}
            >
              <div className="flex items-center justify-center">
                <BarChart2 className="w-4 h-4 mr-1.5" />
                <span className="text-[14px]">Poll</span>
              </div>
            </button>
          )}
        </div>
        
        <div className="border-b p-3">
          <p className="font-medium text-[14px]">Post to CreatorOS</p>
          <p className="mt-1 text-[11px] text-gray-500">Your post will appear on your CreatorOS profile and feed.</p>
        </div>
        
        {/* Your story */}
        <div className="flex justify-between items-center p-3">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4V16M12 4L7 9M12 4L17 9" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 14V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V14" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-[13px] font-medium">Your story</span>
          </div>
          <Switch 
            checked={addToStory}
            onCheckedChange={setAddToStory}
            className="data-[state=checked]:bg-blue-500"
          />
        </div>
      </div>
      
      {/* Share Button */}
      <div className="px-2 py-2.5 bg-white border-t mt-auto">
        <button
          className="w-full bg-black text-white text-[14px] py-2 rounded font-medium"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </div>
      
      {/* Poll Modal */}
      {isPollModalOpen && (
        <div className="fixed inset-0 z-[100] bg-background overflow-y-auto">
          <PollCreator 
            isOpen={true}
            onClose={() => {
              console.log("Closing poll modal");
              setIsPollModalOpen(false);
            }}
            onSave={(data) => {
              console.log("Poll data saved:", data);
              setPollData(data);
              toast({
                title: "Poll Added",
                description: "Your poll has been added to the post"
              });
              setIsPollModalOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
