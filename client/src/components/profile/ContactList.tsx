import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Contact } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { useState } from 'react';

interface ContactListProps {
  userId: number;
}

const ContactList = ({ userId }: ContactListProps) => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [contactName, setContactName] = useState('');
  const [purchaseInfo, setPurchaseInfo] = useState('');
  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['/api/users', userId, 'contacts'],
    enabled: userId > 0,
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}/contacts`);
      if (!response.ok) throw new Error('Failed to load contacts');
      return response.json();
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/contacts', {
        userId,
        contactName: contactName.trim(),
        purchaseInfo: purchaseInfo.trim() || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', userId, 'contacts'] });
      setContactName('');
      setPurchaseInfo('');
      setIsCreating(false);
    },
  });
  
  if (isLoading) {
    return (
      <Card className="shadow-sm mb-6">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center">
                <Skeleton className="w-10 h-10 rounded-full mr-3" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="w-8 h-8 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="shadow-sm mb-6">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Contact List</h2>
          <Button variant="outline" size="sm" onClick={() => setIsCreating(value => !value)}>
            {isCreating ? 'Cancel' : 'New contact'}
          </Button>
        </div>

        {isCreating && (
          <form
            className="mb-4 grid gap-2 rounded-lg border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (contactName.trim()) createContactMutation.mutate();
            }}
          >
            <Input aria-label="Contact name" placeholder="Contact name" value={contactName} onChange={(event) => setContactName(event.target.value)} />
            <Input aria-label="Contact note" placeholder="Purchase or relationship note (optional)" value={purchaseInfo} onChange={(event) => setPurchaseInfo(event.target.value)} />
            <Button type="submit" disabled={!contactName.trim() || createContactMutation.isPending}>Add contact</Button>
          </form>
        )}
        
        <div className="space-y-4">
          {contacts?.map((contact) => (
            <div key={contact.id} className="flex items-center">
              <Avatar className="w-10 h-10 mr-3">
                <AvatarImage src={contact.contactImage ?? undefined} alt={contact.contactName || "Contact"} />
                <AvatarFallback>{contact.contactName ? contact.contactName.charAt(0) : "C"}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">{contact.contactName}</p>
                <p className="text-xs text-gray-500">{contact.purchaseInfo}</p>
              </div>
            </div>
          ))}
          
          {contacts?.length === 0 && (
            <div className="text-center py-4 text-gray-500">
              No contacts found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ContactList;
