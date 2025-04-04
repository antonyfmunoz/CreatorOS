import { useQuery } from '@tanstack/react-query';
import { useCommunitiesStore } from '@/lib/stores';
import { Community, Channel } from '@/types';
import { MessageSquare, Users, Settings, Hash } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface ChannelSidebarProps {
  isMobile?: boolean;
}

const ChannelSidebar = ({ isMobile = false }: ChannelSidebarProps) => {
  const { activeCommunityId, activeChannelId, setActiveCommunity, setActiveChannel } = useCommunitiesStore();
  
  const { data: communities, isLoading: isLoadingCommunities } = useQuery<Community[]>({
    queryKey: ['/api/communities'],
  });
  
  const { data: channels, isLoading: isLoadingChannels } = useQuery<Channel[]>({
    queryKey: ['/api/communities', activeCommunityId, 'channels'],
    enabled: activeCommunityId !== null,
  });
  
  if (isMobile) {
    return null; // Don't render on mobile, handled by modal
  }
  
  return (
    <div className="w-1/4 bg-gray-800 text-white p-4 hidden md:block">
      <h2 className="text-xl font-bold mb-6">Communities</h2>
      
      <div className="space-y-6">
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Your Communities</h3>
          
          {isLoadingCommunities ? (
            <div className="space-y-2">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-gray-700" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {communities?.map(community => (
                <li 
                  key={community.id}
                  className={`
                    flex items-center p-2 rounded-md cursor-pointer
                    ${activeCommunityId === community.id ? 'bg-gray-700' : 'hover:bg-gray-700'}
                  `}
                  onClick={() => setActiveCommunity(community.id)}
                >
                  <span className={`w-2 h-2 ${community.iconColor} rounded-full mr-2`}></span>
                  <span>{community.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {activeCommunityId && (
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Channels</h3>
            
            {isLoadingChannels ? (
              <div className="space-y-2">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full bg-gray-700" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-40">
                <ul className="space-y-1 pr-4">
                  {channels?.map(channel => (
                    <li 
                      key={channel.id}
                      className={`
                        flex items-center p-2 rounded-md cursor-pointer
                        ${activeChannelId === channel.id ? 'bg-gray-700' : 'hover:bg-gray-700'}
                      `}
                      onClick={() => setActiveChannel(channel.id)}
                    >
                      <Hash className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{channel.name}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>
        )}
        
        <div>
          <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Direct Messages</h3>
          <ul className="space-y-2">
            <li className="flex items-center p-2 hover:bg-gray-700 rounded-md cursor-pointer">
              <div className="relative mr-2">
                <div className="w-6 h-6 rounded-full bg-gray-500"></div>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full"></span>
              </div>
              <span>David Kim</span>
            </li>
            <li className="flex items-center p-2 hover:bg-gray-700 rounded-md cursor-pointer">
              <div className="relative mr-2">
                <div className="w-6 h-6 rounded-full bg-gray-500"></div>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-gray-500 rounded-full"></span>
              </div>
              <span>Sarah Mitchell</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChannelSidebar;
