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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [bottomOpen, setBottomOpen] = useState(false);
  const [agentToEdit, setAgentToEdit] = useState<AIAgent | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<AIAgent | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", systemPrompt: "" });
  
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
    queryFn: async () => {
      const response = await fetch(`/api/ai-agents/user/${currentUser!.id}`);
      if (!response.ok) throw new Error('Failed to load custom agents');
      return response.json();
    },
  });

  const createAgentMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('User not authenticated');
      
      const agent = {
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        iconColor: formData.iconColor,
        backgroundColor: formData.backgroundColor,
        systemPrompt: formData.systemPrompt,
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
      setBottomOpen(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create AI agent. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: number) => {
      await apiRequest('DELETE', `/api/ai-agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-agents/user', currentUser?.id] });
      toast({ title: 'Agent deleted', description: 'The custom agent and its chats were removed.' });
      setAgentToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Could not delete agent', description: error.message, variant: 'destructive' });
    },
  });

  const openEditAgent = (agent: AIAgent) => {
    setEditForm({ name: agent.name, description: agent.description, systemPrompt: agent.systemPrompt });
    setAgentToEdit(agent);
  };

  const updateAgentMutation = useMutation({
    mutationFn: async () => {
      if (!agentToEdit) throw new Error('No agent selected');
      const response = await apiRequest('PATCH', `/api/ai-agents/${agentToEdit.id}`, editForm);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-agents/user', currentUser?.id] });
      toast({ title: 'Agent updated', description: 'Your custom agent is ready with its new instructions.' });
      setAgentToEdit(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Could not update agent', description: error.message, variant: 'destructive' });
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
    <main className="min-h-dvh bg-black px-4 pb-20 pt-4 text-white">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full bg-[#1d9bf0] text-white hover:bg-[#1a8cd8]" aria-label="Create AI agent">
              <Plus className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="border-zinc-800 bg-zinc-950 text-white">
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
                    className="col-span-3 border-zinc-700 bg-black text-white"
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
                    className="col-span-3 border-zinc-700 bg-black text-white"
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
                    <SelectTrigger id="icon" aria-label="Agent icon" className="col-span-3 border-zinc-700 bg-black text-white">
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
                    <SelectTrigger id="color" aria-label="Agent color" className="col-span-3 border-zinc-700 bg-black text-white">
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
                    className="col-span-3 border-zinc-700 bg-black text-white"
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
            <div key={i} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
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
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
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
            <AgentCard key={agent.id} agent={agent} layout="list" onEdit={openEditAgent} onDelete={setAgentToDelete} />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 py-8 text-center">
            <p className="text-zinc-500">No custom agents yet. Create your first agent!</p>
          </div>
        )}
      </div>
      
      <Dialog open={bottomOpen} onOpenChange={setBottomOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full rounded-xl border-zinc-700 bg-zinc-900 py-3 text-center text-sm font-medium text-white hover:bg-zinc-800 hover:text-white">
            Train New AI Agent
          </Button>
        </DialogTrigger>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white">
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
                  className="col-span-3 border-zinc-700 bg-black text-white"
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
                  className="col-span-3 border-zinc-700 bg-black text-white"
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
                  <SelectTrigger id="icon-bottom" aria-label="Agent icon" className="col-span-3 border-zinc-700 bg-black text-white">
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
                  <SelectTrigger id="color-bottom" aria-label="Agent color" className="col-span-3 border-zinc-700 bg-black text-white">
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
                  className="col-span-3 border-zinc-700 bg-black text-white"
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

      <Dialog open={agentToEdit !== null} onOpenChange={(nextOpen) => !nextOpen && setAgentToEdit(null)}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle>Edit AI Agent</DialogTitle>
            <DialogDescription>Update how this private agent appears and responds.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); updateAgentMutation.mutate(); }}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-agent-name">Name</Label>
                <Input id="edit-agent-name" value={editForm.name} onChange={(event) => setEditForm((value) => ({ ...value, name: event.target.value }))} className="border-zinc-700 bg-black text-white" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-agent-description">Description</Label>
                <Textarea id="edit-agent-description" value={editForm.description} onChange={(event) => setEditForm((value) => ({ ...value, description: event.target.value }))} className="border-zinc-700 bg-black text-white" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-agent-prompt">Instructions</Label>
                <Textarea id="edit-agent-prompt" value={editForm.systemPrompt} onChange={(event) => setEditForm((value) => ({ ...value, systemPrompt: event.target.value }))} className="min-h-32 border-zinc-700 bg-black text-white" required />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateAgentMutation.isPending}>
                {updateAgentMutation.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={agentToDelete !== null} onOpenChange={(nextOpen) => !nextOpen && setAgentToDelete(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {agentToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This permanently removes the custom agent and its saved chats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={deleteAgentMutation.isPending}
              onClick={() => agentToDelete && deleteAgentMutation.mutate(agentToDelete.id)}
            >
              {deleteAgentMutation.isPending ? 'Deleting...' : 'Delete agent'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default AI;
