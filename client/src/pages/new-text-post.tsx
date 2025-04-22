import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { ChevronRight, X } from "lucide-react";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function NewTextPost() {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  const [, setLocation] = useWouterLocation();
  
  // Poll functionality
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState("1 day");
  
  // Tag functionality
  const [taggedPeople, setTaggedPeople] = useState<string[]>([]);
  const [showTagPeopleDialog, setShowTagPeopleDialog] = useState(false);
  const [showTagProductDialog, setShowTagProductDialog] = useState(false);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showAudienceDialog, setShowAudienceDialog] = useState(false);
  
  // Location
  const [location, setPostLocation] = useState("");
  
  // Audience
  const [audience, setAudience] = useState("Everyone");
  
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
  
  // Poll handling
  const addPollOption = () => {
    if (pollOptions.length < 4) {
      setPollOptions([...pollOptions, ""]);
    } else {
      toast({
        title: "Maximum options reached",
        description: "You can add up to 4 options for your poll",
        variant: "destructive"
      });
    }
  };
  
  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      const newOptions = [...pollOptions];
      newOptions.splice(index, 1);
      setPollOptions(newOptions);
    } else {
      toast({
        description: "A poll requires at least 2 options",
      });
    }
  };
  
  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };
  
  const handleAddPoll = () => {
    if (!pollQuestion.trim()) {
      toast({
        title: "Missing question",
        description: "Please enter a question for your poll",
        variant: "destructive"
      });
      return;
    }
    
    const validOptions = pollOptions.filter(opt => opt.trim() !== "");
    if (validOptions.length < 2) {
      toast({
        title: "Insufficient options",
        description: "Please provide at least 2 options for your poll",
        variant: "destructive"
      });
      return;
    }
    
    // Add poll data to content
    const pollData = {
      question: pollQuestion,
      options: validOptions,
      duration: pollDuration
    };
    
    const pollContent = `
📊 POLL: ${pollQuestion}
${validOptions.map((opt, i) => `${i+1}. ${opt}`).join('\n')}
Duration: ${pollDuration}
`;
    
    setContent((prev) => {
      if (prev.trim()) {
        return `${prev}\n\n${pollContent}`;
      }
      return pollContent;
    });
    
    setShowPollDialog(false);
    
    toast({
      title: "Poll added!",
      description: "Poll has been added to your post",
    });
  };
  
  // Tag and sharing handlers
  const handleTagPeople = () => {
    setShowTagPeopleDialog(true);
    // In a real app, this would fetch users from the database
  };
  
  const handleTagProduct = () => {
    setShowTagProductDialog(true);
    // In a real app, this would fetch products from the database
  };
  
  const handleAddLocation = () => {
    setShowLocationDialog(true);
    // In a real app, this would open a location picker
  };
  
  const handleSetAudience = () => {
    setShowAudienceDialog(true);
  };
  
  const handleConnectSocial = (platform: string) => {
    toast({
      title: `Connect to ${platform}`,
      description: `This would connect your ${platform} account in a real app.`,
    });
  };

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
    
    // In a real app, we would include all the metadata collected
    const postData = {
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory,
      // These would be included in a real implementation
      audience,
      location: location || null,
      taggedPeople: taggedPeople.length > 0 ? taggedPeople : null,
      // A real app would have these fields in the database schema
      // hasPoll: content.includes('📊 POLL:'),
      // pollData: content.includes('📊 POLL:') ? extractPollData(content) : null
    };
    
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
        
        {/* Poll Button */}
        <div className="p-4 border-b">
          <button 
            className="flex items-center justify-center gap-2 rounded-full py-2 px-4 bg-gray-50 w-full"
            onClick={() => setShowPollDialog(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20V12M10 20V4M16 20V12M22 20V4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-sm">Poll</span>
          </button>
        </div>
        
        {/* Tag people */}
        <div 
          className="flex items-center justify-between p-4 border-b cursor-pointer"
          onClick={handleTagPeople}
        >
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 20C4 17.7909 5.79086 16 8 16H16C18.2091 16 20 17.7909 20 20" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Tag people</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </div>
        
        {/* Tag product */}
        <div 
          className="flex items-center justify-between p-4 border-b cursor-pointer"
          onClick={handleTagProduct}
        >
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="18" height="18" rx="1" stroke="black" strokeWidth="1.5"/>
              <path d="M9 3V21" stroke="black" strokeWidth="1.5"/>
              <path d="M3 9H21" stroke="black" strokeWidth="1.5"/>
            </svg>
            <span>Tag product</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </div>
        
        {/* Add location */}
        <div 
          className="flex items-center justify-between p-4 border-b cursor-pointer"
          onClick={handleAddLocation}
        >
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 21.25C12 21.25 19.5 15.75 19.5 9.75C19.5 7.76088 18.7098 5.85322 17.3033 4.4467C15.8968 3.04018 13.9891 2.25 12 2.25C10.0109 2.25 8.10322 3.04018 6.6967 4.4467C5.29018 5.85322 4.5 7.76088 4.5 9.75C4.5 15.75 12 21.25 12 21.25Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 12.75C13.6569 12.75 15 11.4069 15 9.75C15 8.09315 13.6569 6.75 12 6.75C10.3431 6.75 9 8.09315 9 9.75C9 11.4069 10.3431 12.75 12 12.75Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Add location</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </div>
        
        {/* Audience */}
        <div 
          className="flex items-center justify-between p-4 border-b cursor-pointer"
          onClick={handleSetAudience}
        >
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.42012 12.7132C2.28394 12.4975 2.21584 12.3897 2.17772 12.2234C2.14909 12.0985 2.14909 11.9015 2.17772 11.7766C2.21584 11.6103 2.28394 11.5025 2.42012 11.2868C3.54553 9.50484 6.8954 5 12.0004 5C17.1054 5 20.4552 9.50484 21.5806 11.2868C21.7168 11.5025 21.7849 11.6103 21.8231 11.7766C21.8517 11.9015 21.8517 12.0985 21.8231 12.2234C21.7849 12.3897 21.7168 12.4975 21.5806 12.7132C20.4552 14.4952 17.1054 19 12.0004 19C6.8954 19 3.54553 14.4952 2.42012 12.7132Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12.0004 15C13.6573 15 15.0004 13.6569 15.0004 12C15.0004 10.3431 13.6573 9 12.0004 9C10.3435 9 9.0004 10.3431 9.0004 12C9.0004 13.6569 10.3435 15 12.0004 15Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Audience</span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-500 text-sm mr-1">{audience}</span>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </div>
        </div>
        
        {/* Post to section */}
        <div className="border-b">
          <div className="flex items-center justify-between p-3">
            <span className="font-medium text-[14px]">Post to</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="rotate-180">
              <path d="M6 9L12 15L18 9" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          {/* X (Twitter) */}
          <div className="flex justify-between items-center p-3 border-t">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                <span className="text-white text-[10px] font-semibold">X</span>
              </div>
              <div>
                <div className="text-[12px] font-medium">Connect X (Twitter)</div>
                <div className="text-[10px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button 
              className="bg-transparent border border-gray-200 rounded text-[11px] px-2 py-0.5 font-medium"
              onClick={() => handleConnectSocial('X')}
            >
              Connect
            </button>
          </div>
          
          {/* Facebook */}
          <div className="flex justify-between items-center p-3 border-t">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">f</span>
              </div>
              <div>
                <div className="text-[12px] font-medium">Connect Facebook</div>
                <div className="text-[10px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button 
              className="bg-transparent border border-gray-200 rounded text-[11px] px-2 py-0.5 font-medium"
              onClick={() => handleConnectSocial('Facebook')}
            >
              Connect
            </button>
          </div>
          
          {/* Instagram */}
          <div className="flex justify-between items-center p-3 border-t">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full border-[1px] border-black"></div>
                </div>
              </div>
              <div>
                <div className="text-[12px] font-medium">Connect Instagram</div>
                <div className="text-[10px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button 
              className="bg-transparent border border-gray-200 rounded text-[11px] px-2 py-0.5 font-medium"
              onClick={() => handleConnectSocial('Instagram')}
            >
              Connect
            </button>
          </div>
          
          {/* TikTok */}
          <div className="flex justify-between items-center p-3 border-t">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                <span className="text-white text-[10px]">♪</span>
              </div>
              <div>
                <div className="text-[12px] font-medium">Connect TikTok</div>
                <div className="text-[10px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button 
              className="bg-transparent border border-gray-200 rounded text-[11px] px-2 py-0.5 font-medium"
              onClick={() => handleConnectSocial('TikTok')}
            >
              Connect
            </button>
          </div>
          
          {/* YouTube */}
          <div className="flex justify-between items-center p-3 border-t">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                <span className="text-white text-[8px]">▶</span>
              </div>
              <div>
                <div className="text-[12px] font-medium">Connect YouTube</div>
                <div className="text-[10px] text-gray-500">Connect to share posts</div>
              </div>
            </div>
            <button 
              className="bg-transparent border border-gray-200 rounded text-[11px] px-2 py-0.5 font-medium"
              onClick={() => handleConnectSocial('YouTube')}
            >
              Connect
            </button>
          </div>
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
    </div>

    {/* Poll Dialog */}
    <Dialog open={showPollDialog} onOpenChange={setShowPollDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a Poll</DialogTitle>
          <DialogDescription>
            Ask a question and provide options for your followers to vote on.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium">Question</label>
            <Input
              placeholder="Ask a question..."
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              className="mt-1"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Options</label>
            {pollOptions.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder={`Option ${index + 1}`}
                  value={option}
                  onChange={(e) => updatePollOption(index, e.target.value)}
                  className="flex-1"
                />
                {pollOptions.length > 2 && (
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={() => removePollOption(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            
            {pollOptions.length < 4 && (
              <Button 
                variant="outline" 
                className="w-full mt-2" 
                onClick={addPollOption}
              >
                Add Option
              </Button>
            )}
          </div>
          
          <div>
            <label className="text-sm font-medium">Duration</label>
            <select
              value={pollDuration}
              onChange={(e) => setPollDuration(e.target.value)}
              className="w-full p-2 mt-1 border rounded"
            >
              <option value="1 day">1 day</option>
              <option value="3 days">3 days</option>
              <option value="1 week">1 week</option>
              <option value="2 weeks">2 weeks</option>
            </select>
          </div>
          
          <Button 
            className="w-full bg-black hover:bg-gray-800 text-white"
            onClick={handleAddPoll}
          >
            Add Poll
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Tag People Dialog */}
    <Dialog open={showTagPeopleDialog} onOpenChange={setShowTagPeopleDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tag People</DialogTitle>
          <DialogDescription>
            Tag people in your post.
          </DialogDescription>
        </DialogHeader>
        
        <div className="pt-4">
          <Input
            placeholder="Search for people..."
            className="mb-4"
          />
          
          <div className="max-h-60 overflow-y-auto space-y-2 p-1">
            {['John Smith', 'Jane Doe', 'Mark Wilson', 'Emma Johnson'].map((person) => (
              <div 
                key={person}
                className="flex items-center justify-between p-2 hover:bg-gray-100 rounded"
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    {person.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span>{person}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    if (taggedPeople.includes(person)) {
                      setTaggedPeople(taggedPeople.filter(p => p !== person));
                    } else {
                      setTaggedPeople([...taggedPeople, person]);
                    }
                  }}
                >
                  {taggedPeople.includes(person) ? 'Tagged' : 'Tag'}
                </Button>
              </div>
            ))}
          </div>
          
          <Button 
            className="w-full mt-4 bg-black hover:bg-gray-800 text-white"
            onClick={() => setShowTagPeopleDialog(false)}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Tag Product Dialog */}
    <Dialog open={showTagProductDialog} onOpenChange={setShowTagProductDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tag Products</DialogTitle>
          <DialogDescription>
            Tag products in your post.
          </DialogDescription>
        </DialogHeader>
        
        <div className="pt-4">
          <Input
            placeholder="Search for products..."
            className="mb-4"
          />
          
          <div className="max-h-60 overflow-y-auto space-y-2">
            {['Product 1', 'Product 2', 'Product 3'].map((product) => (
              <div 
                key={product}
                className="flex items-center justify-between p-2 hover:bg-gray-100 rounded"
              >
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 bg-gray-200"></div>
                  <div>
                    <div>{product}</div>
                    <div className="text-sm text-gray-500">$29.99</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm">Tag</Button>
              </div>
            ))}
          </div>
          
          <Button 
            className="w-full mt-4 bg-black hover:bg-gray-800 text-white"
            onClick={() => setShowTagProductDialog(false)}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Location Dialog */}
    <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Location</DialogTitle>
          <DialogDescription>
            Add a location to your post.
          </DialogDescription>
        </DialogHeader>
        
        <div className="pt-4">
          <Input
            placeholder="Search for location..."
            value={location}
            onChange={(e) => setPostLocation(e.target.value)}
            className="mb-4"
          />
          
          <div className="max-h-60 overflow-y-auto space-y-2">
            {['New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Miami, FL'].map((loc) => (
              <div 
                key={loc}
                className="flex items-center justify-between p-2 hover:bg-gray-100 rounded cursor-pointer"
                onClick={() => {
                  setPostLocation(loc);
                  setShowLocationDialog(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 21.25C12 21.25 19.5 15.75 19.5 9.75C19.5 7.76088 18.7098 5.85322 17.3033 4.4467C15.8968 3.04018 13.9891 2.25 12 2.25C10.0109 2.25 8.10322 3.04018 6.6967 4.4467C5.29018 5.85322 4.5 7.76088 4.5 9.75C4.5 15.75 12 21.25 12 21.25Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 12.75C13.6569 12.75 15 11.4069 15 9.75C15 8.09315 13.6569 6.75 12 6.75C10.3431 6.75 9 8.09315 9 9.75C9 11.4069 10.3431 12.75 12 12.75Z" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>{loc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Audience Dialog */}
    <Dialog open={showAudienceDialog} onOpenChange={setShowAudienceDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Audience</DialogTitle>
          <DialogDescription>
            Who can see your post?
          </DialogDescription>
        </DialogHeader>
        
        <div className="pt-4 space-y-3">
          {['Everyone', 'Followers', 'Close Friends'].map((option) => (
            <div 
              key={option}
              className={`flex items-center justify-between p-3 rounded cursor-pointer ${audience === option ? 'bg-gray-100' : ''}`}
              onClick={() => {
                setAudience(option);
                setShowAudienceDialog(false);
              }}
            >
              <span className="font-medium">{option}</span>
              {audience === option && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}