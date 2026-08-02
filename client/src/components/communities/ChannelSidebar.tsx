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
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}/channels`);
      if (!response.ok) throw new Error("Failed to load channels");
      return response.json();
    },
  });
  
  return (
    <div className={isMobile ? "h-full w-full bg-zinc-950 p-4 text-white" : "hidden w-1/4 bg-zinc-950 p-4 text-white md:block"}>
      <h2 className="text-xl font-bold mb-6">Communities</h2>
      
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Your Communities</h3>
          
          {isLoadingCommunities ? (
            <div className="space-y-2">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-zinc-900" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {communities?.map(community => (
                <li 
                  key={community.id}
                  className={`
                    flex items-center p-2 rounded-md cursor-pointer
                    ${activeCommunityId === community.id ? 'bg-[#1d9bf0]/15 text-white' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'}
                  `}
                  onClick={() => setActiveCommunity(community.id)}
                >
                  <span className={`mr-2 h-2 w-2 rounded-full ${activeCommunityId === community.id ? 'bg-[#1d9bf0]' : 'bg-zinc-600'}`}></span>
                  <span>{community.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {activeCommunityId && (
          <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Channels</h3>
            
            {isLoadingChannels ? (
              <div className="space-y-2">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full bg-zinc-900" />
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
                        ${activeChannelId === channel.id ? 'bg-[#1d9bf0]/15 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}
                      `}
                      onClick={() => setActiveChannel(channel.id)}
                    >
                      <Hash className="mr-2 h-4 w-4 text-zinc-500" />
                      <span>{channel.name}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>
        )}
        
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Direct Messages</h3>
          <ul className="space-y-2">
            <li className="flex cursor-pointer items-center rounded-md p-2 text-zinc-300 hover:bg-zinc-900 hover:text-white">
              <div className="relative mr-2">
                <div className="h-6 w-6 rounded-full bg-zinc-700"></div>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full"></span>
              </div>
              <span>David Kim</span>
            </li>
            <li className="flex cursor-pointer items-center rounded-md p-2 text-zinc-300 hover:bg-zinc-900 hover:text-white">
              <div className="relative mr-2">
                <div className="h-6 w-6 rounded-full bg-zinc-700"></div>
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-zinc-600"></span>
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
