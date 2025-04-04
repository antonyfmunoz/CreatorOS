import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { AIAgent } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import AgentCard from "@/components/ai/AgentCard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useAppStore } from "@/lib/stores";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const iconOptions = [
  { value: "Pencil", label: "Pencil" },
  { value: "Code", label: "Code" },
  { value: "BarChart", label: "Chart" },
  { value: "Image", label: "Image" },
  { value: "GraduationCap", label: "Education" },
];

const colorOptions = [
  { value: "text-blue-600", label: "Blue", bg: "bg-blue-100" },
  { value: "text-purple-600", label: "Purple", bg: "bg-purple-100" },
  { value: "text-green-600", label: "Green", bg: "bg-green-100" },
  { value: "text-pink-600", label: "Pink", bg: "bg-pink-100" },
  { value: "text-amber-600", label: "Amber", bg: "bg-amber-100" },
];

const AI = () => {
  const { currentUser } = useAppStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "Pencil",
    iconColor: "text-blue-600",
    backgroundColor: "bg-blue-100",
    systemPrompt: "You are a helpful assistant specialized in ",
  });

  // Fetch all standard AI agents
  const { data: standardAgents, isLoading: isLoadingStandard } = useQuery<AIAgent[]>({
    queryKey: ['/api/ai-agents'],
  });

  // Fetch user's custom AI agents
  const { data: customAgents, isLoading: isLoadingCustom } = useQuery<AIAgent[]>({
    queryKey: ['/api/ai-agents/user', currentUser?.id],
    enabled: !!currentUser,
  });

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('User not authenticated');
      
      const agent = {
        userId: currentUser.id,
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        iconColor: formData.iconColor,
        backgroundColor: formData.backgroundColor,
        systemPrompt: formData.systemPrompt,
        isCustom: true,
      };
      
      const res = await apiRequest('POST', '/api/ai-agents', agent);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-agents/user', currentUser?.id] });
      toast({
        title: 'Agent Created',
        description: 'Your AI agent has been created successfully.',
        variant: 'default',
      });
      setFormData({
        name: "",
        description: "",
        icon: "Pencil",
        iconColor: "text-blue-600",
        backgroundColor: "bg-blue-100",
        systemPrompt: "You are a helpful assistant specialized in ",
      });
      setOpen(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create AI agent. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (field: string, value: string) => {
    if (field === 'icon') {
      setFormData(prev => ({ ...prev, icon: value }));
    } else if (field === 'color') {
      const colorOption = colorOptions.find(opt => opt.value === value);
      if (colorOption) {
        setFormData(prev => ({ 
          ...prev, 
          iconColor: value,
          backgroundColor: colorOption.bg
        }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAgentMutation.mutate();
  };

  return (
    <div className="px-4 pt-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full bg-primary text-white">
              <Plus className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New AI Agent</DialogTitle>
              <DialogDescription>
                Train a custom AI agent to help with specific tasks
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-2">
                  <Label htmlFor="name" className="text-right">Name</Label>
                  <Input 
                    id="name" 
                    name="name"
                    placeholder="Content Writer" 
                    className="col-span-3" 
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-2">
                  <Label htmlFor="description" className="text-right">Description</Label>
                  <Textarea 
                    id="description" 
                    name="description"
                    placeholder="Writes blog posts and marketing copy" 
                    className="col-span-3" 
                    value={formData.description}
                    onChange={handleChange}
                    required
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-2">
                  <Label htmlFor="icon" className="text-right">Icon</Label>
                  <Select 
                    onValueChange={(value) => handleSelectChange('icon', value)}
                    defaultValue={formData.icon}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select icon" />
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-2">
                  <Label htmlFor="color" className="text-right">Color</Label>
                  <Select 
                    onValueChange={(value) => handleSelectChange('color', value)}
                    defaultValue={formData.iconColor}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      {colorOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-2">
                  <Label htmlFor="systemPrompt" className="text-right">System Prompt</Label>
                  <Textarea 
                    id="systemPrompt" 
                    name="systemPrompt"
                    placeholder="You are a helpful assistant specialized in..." 
                    className="col-span-3" 
                    value={formData.systemPrompt}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button type="submit" disabled={createAgentMutation.isPending}>
                  {createAgentMutation.isPending ? "Creating..." : "Create Agent"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Standard AI agents */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {isLoadingStandard ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4">
                <Skeleton className="w-12 h-12 rounded-lg mb-3" />
                <Skeleton className="h-5 w-2/3 mb-2" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))
        ) : (
          standardAgents?.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))
        )}
      </div>
      
      {/* Custom AI agents */}
      <h2 className="text-xl font-semibold mb-4">Your Custom Agents</h2>
      
      <div className="grid grid-cols-1 gap-4 mb-8">
        {isLoadingCustom ? (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 flex">
              <Skeleton className="w-12 h-12 rounded-lg mr-4" />
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <Skeleton className="h-5 w-1/3 mb-2" />
                  <Skeleton className="h-5 w-1/4" />
                </div>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        ) : customAgents && customAgents.length > 0 ? (
          customAgents.map(agent => (
            <AgentCard key={agent.id} agent={agent} layout="list" />
          ))
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-500">No custom agents yet. Create your first agent!</p>
          </div>
        )}
      </div>
      
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full py-3 rounded-lg text-center text-sm font-medium">
            Train New AI Agent
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New AI Agent</DialogTitle>
            <DialogDescription>
              Train a custom AI agent to help with specific tasks
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="name-bottom" className="text-right">Name</Label>
                <Input 
                  id="name-bottom" 
                  name="name"
                  placeholder="Content Writer" 
                  className="col-span-3" 
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="description-bottom" className="text-right">Description</Label>
                <Textarea 
                  id="description-bottom" 
                  name="description"
                  placeholder="Writes blog posts and marketing copy" 
                  className="col-span-3" 
                  value={formData.description}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="icon-bottom" className="text-right">Icon</Label>
                <Select 
                  onValueChange={(value) => handleSelectChange('icon', value)}
                  defaultValue={formData.icon}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select icon" />
                  </SelectTrigger>
                  <SelectContent>
                    {iconOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="color-bottom" className="text-right">Color</Label>
                <Select 
                  onValueChange={(value) => handleSelectChange('color', value)}
                  defaultValue={formData.iconColor}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    {colorOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-2">
                <Label htmlFor="systemPrompt-bottom" className="text-right">System Prompt</Label>
                <Textarea 
                  id="systemPrompt-bottom" 
                  name="systemPrompt"
                  placeholder="You are a helpful assistant specialized in..." 
                  className="col-span-3" 
                  value={formData.systemPrompt}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button type="submit" disabled={createAgentMutation.isPending}>
                {createAgentMutation.isPending ? "Creating..." : "Create Agent"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AI;
