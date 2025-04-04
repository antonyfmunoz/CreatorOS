import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/lib/stores';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const categories = ['Course', 'eBook', 'Template', 'Software', 'Coaching'];

const ProductForm = () => {
  const { currentUser } = useAppStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: 'Course',
  });
  
  const createProductMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('User not authenticated');
      
      const product = {
        userId: currentUser.id,
        title: formData.title,
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
        imageUrl: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643', // Default placeholder image
      };
      
      const res = await apiRequest('POST', '/api/products', product);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      toast({
        title: 'Product Created',
        description: 'Your product has been created successfully.',
        variant: 'default',
      });
      setFormData({
        title: '',
        description: '',
        price: '',
        category: 'Course',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create product. Please try again.',
        variant: 'destructive',
      });
    },
  });
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, category: value }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProductMutation.mutate();
  };
  
  return (
    <Card className="shadow-sm mb-6">
      <CardContent className="p-4">
        <h2 className="font-semibold mb-4">Create New Product</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title" className="text-sm text-gray-600 block mb-1">Product Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Advanced SEO Course"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="description" className="text-sm text-gray-600 block mb-1">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe your product..."
              rows={3}
              value={formData.description}
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price" className="text-sm text-gray-600 block mb-1">Price ($)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="49.99"
                value={formData.price}
                onChange={handleChange}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="category" className="text-sm text-gray-600 block mb-1">Category</Label>
              <Select onValueChange={handleSelectChange} defaultValue={formData.category}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button 
            type="submit" 
            className="w-full" 
            disabled={createProductMutation.isPending}
          >
            {createProductMutation.isPending ? 'Creating...' : 'Create Product'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ProductForm;
