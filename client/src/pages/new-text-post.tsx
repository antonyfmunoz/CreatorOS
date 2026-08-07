import { useEffect, useRef, useState } from "react";
import { useLocation as useWouterLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { BarChart2, ImagePlus, Mic, Upload, Video } from "lucide-react";
import { PollCreator } from "@/components/feed/PollCreator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HorizontalRail } from "@/components/ui/horizontal-rail";

type ContentDraft = {
  id: string;
  content: string;
  kind: string;
  audience: string;
  platformVariants: Record<string, unknown>;
};

export default function NewTextPost() {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [pollData, setPollData] = useState<any>(null);
  const [, setLocation] = useWouterLocation();
  const search = useSearch();
  const draftIdFromUrl = new URLSearchParams(search).get("draft");
  const [draftId, setDraftId] = useState<string | null>(draftIdFromUrl);
  const hydratedDraftId = useRef<string | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const draftQuery = useQuery<ContentDraft>({
    queryKey: ["/api/content-drafts", draftIdFromUrl],
    enabled: Boolean(user && draftIdFromUrl),
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/content-drafts/${draftIdFromUrl}`);
      return response.json();
    },
  });

  useEffect(() => {
    if (!draftQuery.data || hydratedDraftId.current === draftQuery.data.id) return;
    hydratedDraftId.current = draftQuery.data.id;
    setDraftId(draftQuery.data.id);
    setContent(draftQuery.data.content);
    setAddToStory(draftQuery.data.platformVariants.addToStory === true);
    setPollData(draftQuery.data.platformVariants.pollData ?? null);
  }, [draftQuery.data]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        content,
        kind: "post",
        audience: "public",
        platformVariants: { addToStory, ...(pollData ? { pollData } : {}) },
      };
      const response = draftId
        ? await apiRequest("PATCH", `/api/content-drafts/${draftId}`, payload)
        : await apiRequest("POST", "/api/content-drafts", payload);
      return response.json() as Promise<ContentDraft>;
    },
    onSuccess: (draft) => {
      setDraftId(draft.id);
      queryClient.invalidateQueries({ queryKey: ["/api/content-drafts"] });
      toast({ title: "Draft saved", description: "You can safely return to it from Create." });
    },
    onError: () => {
      toast({ title: "Draft not saved", description: "Check your connection and try again.", variant: "destructive" });
    },
  });
  
  const createPostMutation = useMutation({
    mutationFn: async (postData: any) => {
      const res = await apiRequest('POST', '/api/posts', postData);
      return res.json();
    },
    onSuccess: async () => {
      if (draftId) {
        try {
          await apiRequest("DELETE", `/api/content-drafts/${draftId}`);
          queryClient.invalidateQueries({ queryKey: ["/api/content-drafts"] });
        } catch {
          // The published post is authoritative; leave a recoverable draft if
          // cleanup was interrupted and let the user remove it later.
        }
      }
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

  const handleSaveDraft = () => {
    if (!user) {
      toast({ title: "Authentication Required", description: "Please log in to save a draft.", variant: "destructive" });
      return;
    }
    saveDraftMutation.mutate();
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
        <div className="flex items-center gap-2">
          <button className="rounded-full px-3 py-1 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-900 disabled:opacity-40" onClick={handleSaveDraft} disabled={saveDraftMutation.isPending}>
            {saveDraftMutation.isPending ? "Saving..." : "Save draft"}
          </button>
          <button className="rounded-full bg-[#1d9bf0] px-3 py-1 text-xs font-bold text-white disabled:opacity-40" onClick={handleSubmit} disabled={!content.trim() || createPostMutation.isPending}>Share</button>
        </div>
      </header>
      
      {/* All content */}
      <div>
        {/* Caption Input */}
        <div className="flex gap-3 border-b border-zinc-800 p-4">
          <Avatar className="h-10 w-10 shrink-0"><AvatarImage src={user?.profileImageUrl || undefined} /><AvatarFallback>{user?.displayName?.charAt(0) ?? "Y"}</AvatarFallback></Avatar>
          <textarea
            className="h-36 w-full resize-none bg-transparent text-lg text-white outline-none placeholder:text-zinc-500"
            placeholder="What's on your mind?"
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
            <HorizontalRail className="gap-3">
              <button type="button" className="flex shrink-0 items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800" onClick={() => setLocation('/create/post?type=photo')}><ImagePlus className="h-4 w-4 text-[#1d9bf0]" /> Photo</button>
              <button type="button" className="flex shrink-0 items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800" onClick={() => setLocation('/create/post?type=video')}><Video className="h-4 w-4 text-[#1d9bf0]" /> Video</button>
              <button type="button" className="flex shrink-0 items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800" onClick={() => setLocation('/create/post?type=audio')}><Mic className="h-4 w-4 text-[#1d9bf0]" /> Audio</button>
              <button type="button" className="flex shrink-0 items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800" onClick={() => setIsPollModalOpen(true)}><BarChart2 className="h-4 w-4 text-[#1d9bf0]" /> Poll</button>
            </HorizontalRail>
          )}
        </div>
        
        <div className="border-b border-zinc-800 p-3">
          <p className="font-medium text-[14px]">Post to CreativesOS</p>
          <p className="mt-1 text-[11px] text-zinc-500">Your post will appear on your CreativesOS profile and feed.</p>
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
          disabled={!content.trim() || createPostMutation.isPending}
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
