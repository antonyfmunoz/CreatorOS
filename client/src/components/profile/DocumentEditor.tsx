import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Folder, Share2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/stores';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Document } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const DocumentEditor = () => {
  const { currentUser } = useAppStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  
  // Get the first document (for simplicity)
  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ['/api/users', currentUser?.id, 'documents'],
    enabled: !!currentUser,
  });
  
  const document = documents?.[0];
  
  // Set content when document loads
  useEffect(() => {
    if (document) {
      setContent(document.content);
    }
  }, [document]);
  
  const updateDocumentMutation = useMutation({
    mutationFn: async () => {
      if (!document) throw new Error('No document found');
      
      const res = await apiRequest('PUT', `/api/documents/${document.id}`, {
        title: document.title,
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', currentUser?.id, 'documents'] });
      toast({
        title: 'Document Saved',
        description: 'Your document has been saved successfully.',
        variant: 'default',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save document. Please try again.',
        variant: 'destructive',
      });
    },
  });
  
  const handleContentChange = (e: React.FormEvent<HTMLDivElement>) => {
    setContent(e.currentTarget.innerHTML);
  };
  
  const handleSave = () => {
    updateDocumentMutation.mutate();
  };
  
  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <Skeleton className="h-6 w-32" />
            <div className="flex space-x-2">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Notion-Style Document</h2>
          <div className="flex space-x-2">
            <Button variant="ghost" size="icon" onClick={handleSave}>
              <Folder className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div
          contentEditable
          className="min-h-[150px] focus:outline-none"
          onInput={handleContentChange}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </CardContent>
    </Card>
  );
};

export default DocumentEditor;
