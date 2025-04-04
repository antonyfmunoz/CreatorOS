import { useQuery } from '@tanstack/react-query';
import { User } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

const Stories = () => {
  const { data: users, isLoading } = useQuery<User[]>({ 
    queryKey: ['/api/users'],
  });

  if (isLoading) {
    return (
      <div className="overflow-x-auto scrollbar-hide mb-6">
        <div className="flex space-x-4">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <Skeleton className="w-16 h-16 rounded-full" />
              <Skeleton className="w-12 h-3 mt-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-hide mb-6">
      <div className="flex space-x-4">
        {users?.map((user) => (
          <div key={user.id} className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary to-secondary p-0.5">
              <Avatar className="w-full h-full border-2 border-white">
                <AvatarImage 
                  src={user.profileImageUrl} 
                  alt={user.displayName} 
                  className="object-cover" 
                />
                <AvatarFallback>
                  {user.displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-xs mt-1">{user.displayName.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Stories;
