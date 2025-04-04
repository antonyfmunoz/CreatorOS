import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface AvatarGroupProps {
  users: {
    imageUrl?: string;
    name: string;
  }[];
  max?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AvatarGroup({
  users,
  max = 4,
  size = "md",
  className,
}: AvatarGroupProps) {
  const displayUsers = users.slice(0, max);
  const remaining = users.length - max;

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  const offsetClasses = {
    sm: "-ml-3",
    md: "-ml-4",
    lg: "-ml-5",
  };

  return (
    <div className={cn("flex", className)}>
      {displayUsers.map((user, i) => (
        <Avatar
          key={i}
          className={cn(
            sizeClasses[size],
            "border-2 border-white",
            i > 0 && offsetClasses[size]
          )}
        >
          <AvatarImage src={user.imageUrl} alt={user.name} />
          <AvatarFallback>
            {user.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </AvatarFallback>
        </Avatar>
      ))}

      {remaining > 0 && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full border-2 border-white bg-muted text-muted-foreground",
            sizeClasses[size],
            offsetClasses[size]
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
