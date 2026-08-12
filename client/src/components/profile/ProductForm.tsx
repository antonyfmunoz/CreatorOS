import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/lib/stores';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

const offerTypes = [
  { value: 'digital_download', label: 'Digital download', category: 'Digital Asset' },
  { value: 'course', label: 'Course', category: 'Course' },
  { value: 'community', label: 'Community', category: 'Community' },
  { value: 'membership', label: 'Membership', category: 'Membership' },
] as const;
type Business = { id: string; name: string; handle: string; isDefault: boolean };

const ProductForm = () => {
  const { currentUser } = useAppStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: 'Course',
    productType: 'course',
    billingModel: 'one_time',
    billingInterval: 'month',
    businessId: '',
  });
  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ['/api/businesses'],
    enabled: Boolean(currentUser),
    queryFn: async () => (await apiRequest('GET', '/api/businesses')).json(),
  });
  
  const createProductMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error('User not authenticated');
      
      const product = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        price: Number(formData.price),
        category: formData.category,
        productType: formData.productType,
        billingModel: formData.billingModel,
        billingInterval: formData.billingModel === 'recurring' ? formData.billingInterval : null,
        ...(formData.businessId ? { businessId: formData.businessId } : {}),
      };
      
      const res = await apiRequest('POST', '/api/products', product);
      return res.json();
    },
    onSuccess: (product) => {
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
        productType: 'course',
        billingModel: 'one_time',
        billingInterval: 'month',
        businessId: '',
      });
      setLocation(`/products/${product.id}/edit`);
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
  
  const handleOfferTypeChange = (value: string) => {
    const offer = offerTypes.find((candidate) => candidate.value === value) ?? offerTypes[0];
    setFormData(prev => ({
      ...prev,
      category: offer.category,
      productType: offer.value,
      billingModel: offer.value === 'membership' ? 'recurring' : prev.billingModel === 'recurring' && offer.value !== 'community' ? 'one_time' : prev.billingModel,
    }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProductMutation.mutate();
  };
  
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-white">
        <div className="mb-5">
          <h2 className="text-sm font-bold">Offer details</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Create the offer first, then add protected files, delivery, and payout settings.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title" className="mb-2 block text-sm text-zinc-300">Offer title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Advanced SEO Course"
              value={formData.title}
              onChange={handleChange}
              maxLength={160}
              className="border-zinc-700 bg-black text-white placeholder:text-zinc-600"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="description" className="mb-2 block text-sm text-zinc-300">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe your product..."
              rows={3}
              value={formData.description}
              onChange={handleChange}
              maxLength={10000}
              className="min-h-28 border-zinc-700 bg-black text-white placeholder:text-zinc-600"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price" className="mb-2 block text-sm text-zinc-300">Price (USD)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                placeholder="49.99"
                value={formData.price}
                onChange={handleChange}
                className="border-zinc-700 bg-black text-white placeholder:text-zinc-600"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="product-type" className="mb-2 block text-sm text-zinc-300">Offer type</Label>
              <Select onValueChange={handleOfferTypeChange} value={formData.productType}>
                <SelectTrigger className="border-zinc-700 bg-black text-white">
                  <SelectValue placeholder="Select offer type" />
                </SelectTrigger>
                <SelectContent>
                  {offerTypes.map(offer => (
                    <SelectItem key={offer.value} value={offer.value}>
                      {offer.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(formData.productType === 'community' || formData.productType === 'membership') && <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block text-sm text-zinc-300">Payment schedule</Label>
              <Select value={formData.billingModel} onValueChange={(billingModel) => setFormData((current) => ({ ...current, billingModel }))}>
                <SelectTrigger className="border-zinc-700 bg-black text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {formData.productType === 'community' && <SelectItem value="one_time">One-time access</SelectItem>}
                  <SelectItem value="recurring">Recurring membership</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.billingModel === 'recurring' && <div>
              <Label className="mb-2 block text-sm text-zinc-300">Billing interval</Label>
              <Select value={formData.billingInterval} onValueChange={(billingInterval) => setFormData((current) => ({ ...current, billingInterval }))}>
                <SelectTrigger className="border-zinc-700 bg-black text-white"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="month">Monthly</SelectItem><SelectItem value="year">Yearly</SelectItem></SelectContent>
              </Select>
            </div>}
          </div>}
          {businesses.length > 1 && <div>
            <Label className="mb-2 block text-sm text-zinc-300">Business</Label>
            <Select value={formData.businessId} onValueChange={(businessId) => setFormData((current) => ({ ...current, businessId }))}>
              <SelectTrigger className="border-zinc-700 bg-black text-white"><SelectValue placeholder="Your default business" /></SelectTrigger>
              <SelectContent>{businesses.map((business) => <SelectItem key={business.id} value={business.id}>{business.name}{business.isDefault ? ' (default)' : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          
          <Button 
            type="submit" 
            className="h-11 w-full rounded-xl bg-white font-bold text-black hover:bg-zinc-200"
            disabled={createProductMutation.isPending}
          >
            {createProductMutation.isPending ? 'Creating…' : 'Continue to setup'}
          </Button>
        </form>
    </section>
  );
};

export default ProductForm;
