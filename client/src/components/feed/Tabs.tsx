import { useState } from 'react';

export type TabType = 'forYou' | 'following';

interface TabsProps {
  activeTab: TabType;
  onChange: (tab: TabType) => void;
}

export const Tabs = ({ activeTab, onChange }: TabsProps) => {
  return (
    <div className="flex w-full border-b">
      <TabButton 
        isActive={activeTab === 'forYou'} 
        onClick={() => onChange('forYou')}
        label="For You" 
      />
      <TabButton 
        isActive={activeTab === 'following'} 
        onClick={() => onChange('following')}
        label="Following" 
      />
    </div>
  );
};

interface TabButtonProps {
  isActive: boolean;
  onClick: () => void;
  label: string;
}

const TabButton = ({ isActive, onClick, label }: TabButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-medium relative ${
        isActive 
          ? 'text-black dark:text-white' 
          : 'text-gray-500 dark:text-gray-400'
      }`}
    >
      {label}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white" />
      )}
    </button>
  );
};

export const Tab = ({ label }: { label: string }) => {
  return null; // This is just a placeholder for documentation purposes
};