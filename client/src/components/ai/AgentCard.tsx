import { Card, CardContent } from "@/components/ui/card";
import { AIAgent } from "@/types";
import { Badge } from "@/components/ui/badge";
import { useAIChatStore } from "@/lib/stores";
import { formatDistanceToNow } from "date-fns";
import { 
  Pencil, 
  Code, 
  ChartBarStacked, 
  Image, 
  GraduationCap,
  Italic
} from "lucide-react";

// Map of icon names to Lucide components
const iconMap: Record<string, Italic> = {
  Pencil,
  Code,
  ChartBarStacked,
  Image,
  GraduationCap,
};

interface AgentCardProps {
  agent: AIAgent;
  layout?: "grid" | "list";
}

const AgentCard = ({ agent, layout = "grid" }: AgentCardProps) => {
  const { openChat } = useAIChatStore();
  
  // Get the correct icon component
  const IconComponent = iconMap[agent.icon];
  
  const handleOpenChat = () => {
    openChat(agent);
  };
  
  if (layout === "list") {
    return (
      <Card 
        className="overflow-hidden cursor-pointer hover:border-primary transition-colors"
        onClick={handleOpenChat}
      >
        <CardContent className="p-4 flex">
          <div className={`w-12 h-12 rounded-lg ${agent.backgroundColor} flex items-center justify-center mr-4`}>
            {IconComponent && <IconComponent className={`h-6 w-6 ${agent.iconColor}`} />}
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <h3 className="font-medium">{agent.name}</h3>
              <Badge variant="outline" className="bg-green-100 text-green-800 px-2 py-0.5 text-xs">
                {agent.status}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-1">{agent.description}</p>
            <div className="flex items-center mt-2 text-xs text-gray-500">
              <span>Created {formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })}</span>
              <span className="mx-2">•</span>
              <span>{agent.chatCount} chats</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card 
      className="overflow-hidden cursor-pointer hover:border-primary transition-colors"
      onClick={handleOpenChat}
    >
      <CardContent className="p-4">
        <div className={`w-12 h-12 rounded-lg ${agent.backgroundColor} flex items-center justify-center mb-3`}>
          {IconComponent && <IconComponent className={`h-6 w-6 ${agent.iconColor}`} />}
        </div>
        <h3 className="font-medium">{agent.name}</h3>
        <p className="text-xs text-gray-500 mt-1">{agent.description}</p>
      </CardContent>
    </Card>
  );
};

export default AgentCard;
