import { cn } from "@/lib/utils";

export type TabType = "forYou" | "following";

interface TabsProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export function Tabs({ activeTab, onChange }: TabsProps) {
  return (
    <div className="flex w-full border-b border-zinc-800 bg-black">
      <button
        type="button"
        aria-pressed={activeTab === "forYou"}
        onClick={() => onChange("forYou")}
        className={cn(
          "flex-1 py-3 text-sm font-medium text-center transition-colors relative",
          activeTab === "forYou"
            ? "text-white"
            : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        For You
        {activeTab === "forYou" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1d9bf0]" />
        )}
      </button>
      <button
        type="button"
        aria-pressed={activeTab === "following"}
        onClick={() => onChange("following")}
        className={cn(
          "flex-1 py-3 text-sm font-medium text-center transition-colors relative",
          activeTab === "following"
            ? "text-white"
            : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        Following
        {activeTab === "following" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1d9bf0]" />
        )}
      </button>
    </div>
  );
}
