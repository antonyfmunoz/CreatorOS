import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  className?: string;
}

const StatCard = ({ title, value, className = "" }: StatCardProps) => {
  return (
    <Card className={`shadow-sm ${className}`}>
      <CardContent className="p-4 text-center">
        <span className="text-xl font-bold">{value}</span>
        <p className="text-xs text-gray-500">{title}</p>
      </CardContent>
    </Card>
  );
};

export default StatCard;
