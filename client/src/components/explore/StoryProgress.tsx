import React from 'react';

interface StoryProgressProps {
  currentIndex: number;
  totalStories: number;
  progress: number;
  duration: number;
}

const StoryProgress: React.FC<StoryProgressProps> = ({
  currentIndex,
  totalStories,
  progress,
  duration
}) => {
  return (
    <div className="flex w-full gap-1.5">
      {Array.from({ length: totalStories }).map((_, index) => (
        <div 
          key={index} 
          className="h-1 bg-white/30 rounded-full flex-1 overflow-hidden"
        >
          <div 
            className="h-full bg-white rounded-full"
            style={{
              width: index < currentIndex 
                ? '100%' 
                : index === currentIndex 
                  ? `${progress}%` 
                  : '0%',
              transition: index === currentIndex 
                ? `width 0.15s linear` 
                : 'none'
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default StoryProgress;