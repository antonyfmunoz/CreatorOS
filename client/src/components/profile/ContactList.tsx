import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Contact } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ContactListProps {
  userId: number;
}

const ContactList = ({ userId }: ContactListProps) => {
  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ['/api/users', userId, 'contacts'],
    enabled: userId > 0,
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
          <Button variant="link" className="text-primary text-sm font-medium p-0">View All</Button>
        </div>
        
        <div className="space-y-4">
          {contacts?.map((contact) => (
            <div key={contact.id} className="flex items-center">
              <Avatar className="w-10 h-10 mr-3">
                <AvatarImage src={contact.contactImage} alt={contact.contactName} />
                <AvatarFallback>{contact.contactName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">{contact.contactName}</p>
                <p className="text-xs text-gray-500">{contact.purchaseInfo}</p>
              </div>
              <Button variant="ghost" size="icon" className="text-gray-400">
                <MessageSquare className="h-5 w-5" />
              </Button>
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
