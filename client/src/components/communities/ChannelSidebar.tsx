import { useQuery } from '@tanstack/react-query';
import { useCommunitiesStore } from '@/lib/stores';
import { Community, Channel } from '@/types';
import { Hash } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';

interface ChannelSidebarProps {
  isMobile?: boolean;
  isMember?: boolean;
}

const ChannelSidebar = ({ isMobile = false, isMember = false }: ChannelSidebarProps) => {
  const { activeCommunityId, activeChannelId, setActiveCommunity, setActiveChannel } = useCommunitiesStore();
  
  const { data: communities, isLoading: isLoadingCommunities } = useQuery<Community[]>({
    queryKey: ['/api/communities'],
  });
  
  const { data: channels, isLoading: isLoadingChannels } = useQuery<Channel[]>({
    queryKey: ['/api/communities', activeCommunityId, 'channels'],
    enabled: activeCommunityId !== null && isMember,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}/channels`);
      if (!response.ok) throw new Error("Failed to load channels");
      return response.json();
    },
  });
  const activeCommunity = communities?.find((community) => community.id === activeCommunityId);
  
  return (
    <div className={isMobile ? "h-full w-full bg-zinc-950 p-4 text-white" : "hidden w-52 shrink-0 border-r border-zinc-800 bg-[#171719] p-4 text-white md:block"}>
      <h2 className="mb-5 text-2xl font-bold">{isMobile ? "Communities" : activeCommunity?.name ?? "Community"}</h2>
      
      <div className="space-y-6">
        {isMobile && <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Switch community</h3>
          
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
        </div>}
        
        {isMember && activeCommunityId && (
          <div>
          {!isMobile && <Input placeholder="Search channels" className="mb-6 h-11 rounded-xl border-0 bg-black px-4 text-white placeholder:text-zinc-500" />}
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Text channels</h3>
            
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
                        ${activeChannelId === channel.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}
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
        
        {isMember && <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs leading-5 text-zinc-500">Choose a channel to join the conversation.</p>}
      </div>
    </div>
  );
};

export default ChannelSidebar;
