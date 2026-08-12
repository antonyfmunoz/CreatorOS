import { Share2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface PostOptionsPanelProps {
  content: string;
  onContentChange: (content: string) => void;
  addToStory: boolean;
  onAddToStoryChange: (value: boolean) => void;
  onShare: () => void;
  isSharing?: boolean;
  shareDisabled?: boolean;
}

/**
 * Shared final step for photo, video, and voice posts. It intentionally exposes
 * only delivery choices supported by the current CreatorOS MVP.
 */
export const PostOptionsPanel = ({ addToStory, onAddToStoryChange, onShare, isSharing = false, shareDisabled = false }: PostOptionsPanelProps) => {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-grow space-y-4 px-4 py-5">
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="font-medium">Post to CreativesOS</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your post will appear in your CreativesOS feed and on your profile.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            <span>Your story</span>
          </div>
          <Switch
            checked={addToStory}
            onCheckedChange={onAddToStoryChange}
            aria-label="Add to your story"
          />
        </div>
      </div>

      <div className="sticky bottom-0 border-t bg-background px-4 pb-4 pt-3">
        <Button className="w-full" onClick={onShare} disabled={isSharing || shareDisabled}>
          {isSharing ? 'Sharing…' : 'Share'}
        </Button>
      </div>
    </div>
  );
};
