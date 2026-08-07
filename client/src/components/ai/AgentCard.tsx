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
  PencilLine,
  Trash2,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Pencil,
  Code,
  BarChart: ChartBarStacked,
  Image,
  GraduationCap,
};

interface AgentCardProps {
  agent: AIAgent;
  layout?: "grid" | "list";
  onEdit?: (agent: AIAgent) => void;
  onDelete?: (agent: AIAgent) => void;
}

const AgentCard = ({ agent, layout = "grid", onEdit, onDelete }: AgentCardProps) => {
  const { openChat } = useAIChatStore();
  const IconComponent = iconMap[agent.icon];

  if (layout === "list") {
    return (
      <Card className="overflow-hidden border-zinc-800 bg-zinc-950 text-white transition-colors hover:border-[#1d9bf0]">
        <CardContent className="p-0">
          <button
            type="button"
            className="flex w-full p-4 text-left"
            onClick={() => openChat(agent)}
            aria-label={`Open ${agent.name} chat`}
          >
            <div className={`mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${agent.backgroundColor}`}>
              {IconComponent && <IconComponent className={`h-6 w-6 ${agent.iconColor}`} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate font-medium">{agent.name}</h3>
                <Badge variant="outline" className="border-emerald-800 bg-emerald-950 px-2 py-0.5 text-xs text-emerald-300">
                  {agent.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{agent.description}</p>
              <div className="mt-2 flex flex-wrap items-center text-xs text-zinc-500">
                <span>Created {formatDistanceToNow(new Date(agent.createdAt), { addSuffix: true })}</span>
                <span className="mx-2">&bull;</span>
                <span>{agent.chatCount} chats</span>
              </div>
            </div>
          </button>
          {(onEdit || onDelete) && (
            <div className="flex justify-end gap-4 border-t border-zinc-900 px-4 py-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(agent)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-[#1d9bf0]"
                  aria-label={`Edit ${agent.name}`}
                >
                  <PencilLine className="h-3.5 w-3.5" /> Edit
                </button>
              )}
              {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(agent)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-red-400"
                aria-label={`Delete ${agent.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-zinc-800 bg-zinc-950 text-white transition-colors hover:border-[#1d9bf0]">
      <CardContent className="p-0">
        <button
          type="button"
          className="w-full p-4 text-left"
          onClick={() => openChat(agent)}
          aria-label={`Open ${agent.name} chat`}
        >
          <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-lg ${agent.backgroundColor}`}>
            {IconComponent && <IconComponent className={`h-6 w-6 ${agent.iconColor}`} />}
          </div>
          <h3 className="font-medium">{agent.name}</h3>
          <p className="mt-1 text-xs text-zinc-500">{agent.description}</p>
        </button>
      </CardContent>
    </Card>
  );
};

export default AgentCard;
