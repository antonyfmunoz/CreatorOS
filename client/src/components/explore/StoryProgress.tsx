import React from 'react';

interface StoryProgressProps {
  currentIndex: number;
  totalStories: number;
  progress: number;
  duration?: number;
}

const StoryProgress: React.FC<StoryProgressProps> = ({
  currentIndex,
  totalStories,
  progress,
  duration = 5000,
}) => {
  return (
    <div className="flex gap-1 w-full px-2">
      {Array.from({ length: totalStories }).map((_, index) => (
        <div
          key={index}
          className={`h-1 bg-white/30 rounded-full flex-1 overflow-hidden`}
        >
          {index === currentIndex && (
            <div
              className="h-full bg-white"
              style={{
                width: `${progress}%`,
                transition: `width ${duration / 1000}s linear`,
              }}
            ></div>
          )}
          {index < currentIndex && (
            <div className="h-full bg-white w-full"></div>
          )}
        </div>
      ))}
    </div>
  );
};

export default StoryProgress;