import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Revenue } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';

interface TimeRange {
  label: string;
  days: number;
}

const timeRanges: TimeRange[] = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const RevenueChart = ({ userId }: { userId: number }) => {
  const [selectedRange, setSelectedRange] = useState<TimeRange>(timeRanges[0]);
  
  const { data: revenueData, isLoading } = useQuery<Revenue[]>({
    queryKey: ['/api/users', userId, 'revenue'],
    enabled: userId > 0,
  });
  
  if (isLoading) {
    return (
      <Card className="shadow-sm mb-6">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-40" />
          </div>
          <Skeleton className="h-40 w-full" />
          <div className="flex justify-between mt-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Filter data based on selected range
  const filteredData = revenueData?.filter(item => {
    const itemDate = new Date(item.date);
    const cutoffDate = subDays(new Date(), selectedRange.days);
    return itemDate >= cutoffDate;
  }) || [];
  
  // Calculate the maximum value for scaling
  const maxValue = Math.max(...filteredData.map(item => item.amount), 100);
  
  // Sort data by date
  const sortedData = [...filteredData].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Get first and last dates for display
  const startDate = sortedData[0]?.date 
    ? format(new Date(sortedData[0].date), 'MMM d')
    : format(subDays(new Date(), selectedRange.days), 'MMM d');
    
  const endDate = sortedData[sortedData.length - 1]?.date 
    ? format(new Date(sortedData[sortedData.length - 1].date), 'MMM d')
    : format(new Date(), 'MMM d');
  
  return (
    <Card className="shadow-sm mb-6">
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Revenue Overview</h2>
          <Select 
            onValueChange={(value) => {
              const selected = timeRanges.find(range => range.label === value);
              if (selected) setSelectedRange(selected);
            }}
            defaultValue={selectedRange.label}
          >
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              {timeRanges.map((range) => (
                <SelectItem key={range.label} value={range.label}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="h-40 flex items-end space-x-2">
          {sortedData.length > 0 ? (
            sortedData.map((item, index) => (
              <div 
                key={index}
                className="flex-1 bg-blue-100 rounded-t-md relative group"
                style={{ height: `${(item.amount / maxValue) * 100}%` }}
                title={`$${item.amount.toFixed(2)} on ${format(new Date(item.date), 'MMM d, yyyy')}`}
              >
                {index === sortedData.length - 1 && (
                  <div className="absolute inset-0 bg-primary rounded-t-md" />
                )}
                
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-gray-800 text-white py-1 px-2 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  ${item.amount.toFixed(2)}
                  <br />
                  {format(new Date(item.date), 'MMM d')}
                </div>
              </div>
            ))
          ) : (
            <div className="w-full flex items-center justify-center text-gray-400 text-sm">
              No revenue data available
            </div>
          )}
        </div>
        
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>{startDate}</span>
          <span>{endDate}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default RevenueChart;
