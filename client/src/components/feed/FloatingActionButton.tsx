import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const FloatingActionButton = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [postType, setPostType] = useState<'text' | 'image' | 'voice' | 'video' | null>(null);

  const openDialog = () => setIsDialogOpen(true);
  const closeDialog = () => {
    setIsDialogOpen(false);
    setPostType(null);
  };

  return (
    <>
      <Button
        onClick={openDialog}
        className="fixed bottom-20 right-5 z-50 p-4 h-14 w-14 rounded-full shadow-lg
        bg-white text-black dark:bg-black dark:text-white transition-colors"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Post</DialogTitle>
            <DialogDescription>
              {!postType 
                ? 'Choose the type of content you want to share' 
                : `Create a new ${postType} post`}
            </DialogDescription>
          </DialogHeader>

          {!postType ? (
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                className="h-24 flex flex-col"
                onClick={() => setPostType('text')}
              >
                <span className="text-xl mb-2">📝</span>
                Text
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col"
                onClick={() => setPostType('image')}
              >
                <span className="text-xl mb-2">🖼️</span>
                Image
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col"
                onClick={() => setPostType('voice')}
              >
                <span className="text-xl mb-2">🎙️</span>
                Voice
              </Button>
              <Button 
                variant="outline" 
                className="h-24 flex flex-col"
                onClick={() => setPostType('video')}
              >
                <span className="text-xl mb-2">🎬</span>
                Video
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {postType === 'text' && (
                <Textarea 
                  placeholder="What's on your mind?"
                  className="min-h-[150px]"
                />
              )}
              
              {postType === 'image' && (
                <>
                  <div className="border-2 border-dashed rounded-lg p-12 text-center">
                    <Label htmlFor="image-upload" className="cursor-pointer">
                      Click to upload an image
                    </Label>
                    <Input 
                      id="image-upload" 
                      type="file" 
                      accept="image/*"
                      className="hidden" 
                    />
                  </div>
                  <Textarea 
                    placeholder="Add a caption..."
                    className="min-h-[80px]"
                  />
                </>
              )}
              
              {postType === 'voice' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Button className="mx-auto mb-2">
                      Start Recording
                    </Button>
                    <p className="text-sm text-gray-500">
                      Click to start recording your voice
                    </p>
                  </div>
                  <Textarea 
                    placeholder="Add a transcript or description..."
                    className="min-h-[80px]"
                  />
                </div>
              )}
              
              {postType === 'video' && (
                <>
                  <div className="border-2 border-dashed rounded-lg p-12 text-center">
                    <Label htmlFor="video-upload" className="cursor-pointer">
                      Click to upload a video
                    </Label>
                    <Input 
                      id="video-upload" 
                      type="file" 
                      accept="video/*"
                      className="hidden" 
                    />
                  </div>
                  <Textarea 
                    placeholder="Add a caption..."
                    className="min-h-[80px]"
                  />
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {postType && (
              <Button variant="outline" onClick={() => setPostType(null)}>
                Back
              </Button>
            )}
            <Button onClick={closeDialog}>
              {postType ? 'Post' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};