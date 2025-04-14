import { cn } from "@/lib/utils";

export type TabType = "forYou" | "following";

interface TabsProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export function Tabs({ activeTab, onChange }: TabsProps) {
  return (
    <div className="flex border-b border-gray-200 dark:border-gray-800 w-full">
      <button
        onClick={() => onChange("forYou")}
        className={cn(
          "flex-1 py-3 text-sm font-medium text-center transition-colors relative",
          activeTab === "forYou"
            ? "text-black dark:text-white"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300"
        )}
      >
        For You
        {activeTab === "forYou" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white" />
        )}
      </button>
      <button
        onClick={() => onChange("following")}
        className={cn(
          "flex-1 py-3 text-sm font-medium text-center transition-colors relative",
          activeTab === "following"
            ? "text-black dark:text-white"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300"
        )}
      >
        Following
        {activeTab === "following" && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white" />
        )}
      </button>
    </div>
  );
}