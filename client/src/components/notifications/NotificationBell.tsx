import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import NotificationPanel from './NotificationPanel';

const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button size="icon" variant="outline" className="bg-gray-100 rounded-full relative">
          <Bell className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-md p-0 border-l">
        <NotificationPanel onClose={() => setIsOpen(false)} />
      </SheetContent>
    </Sheet>
  );
};

export default NotificationBell;