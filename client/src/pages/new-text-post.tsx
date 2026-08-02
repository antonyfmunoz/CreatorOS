import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { BarChart2, Upload } from "lucide-react";
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
    <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-black pb-20 text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <button 
          className="rounded-full px-2 py-1 text-xl text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
          onClick={() => setLocation('/')}
          aria-label="Cancel post"
        >
          ✕
        </button>
        <span className="font-semibold">New post</span>
        <div className="w-5"></div>
      </header>
      
      {/* All content */}
      <div>
        {/* Caption Input */}
        <div className="border-b border-zinc-800 p-4">
          <textarea
            className="h-28 w-full resize-none bg-transparent text-base text-white outline-none placeholder:text-zinc-500"
            placeholder="Write a caption..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          ></textarea>
        </div>
        
        {/* Poll Button - Exactly matching the PhotoUploader.tsx line 628 */}
        <div className="space-y-4 border-b border-zinc-800 p-4">
          {pollData ? (
            <div className="rounded-lg bg-zinc-900 p-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium">Poll: {pollData.question}</h3>
                <button 
                  className="text-red-400"
                  onClick={() => setPollData(null)}
                >
                  Remove
                </button>
              </div>
              <div className="space-y-2">
                {pollData.options.map((option: string, i: number) => (
                  <div key={i} className="rounded-md bg-zinc-800 p-2">{option}</div>
                ))}
              </div>
            </div>
          ) : (
            <button 
              type="button"
              className="flex h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-zinc-700 bg-transparent px-4 py-2 text-zinc-200 transition-colors hover:bg-zinc-900"
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
        
        <div className="border-b border-zinc-800 p-3">
          <p className="font-medium text-[14px]">Post to CreatorOS</p>
          <p className="mt-1 text-[11px] text-zinc-500">Your post will appear on your CreatorOS profile and feed.</p>
        </div>
        
        {/* Your story */}
        <div className="flex justify-between items-center p-3">
          <div className="flex items-center gap-2">
            <Upload className="h-[18px] w-[18px] text-zinc-300" />
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
      <footer className="mt-auto border-t border-zinc-800 bg-black px-3 py-3">
        <button
          className="w-full rounded-lg bg-[#1d9bf0] py-2.5 text-[14px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleSubmit}
          disabled={!content.trim()}
        >
          Share
        </button>
      </footer>
      
      {/* Poll Modal */}
      {isPollModalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black">
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
    </main>
  );
}
