import { useAuthStore } from "@/lib/stores";
import { Redirect, Route } from "wouter";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  return (
    <Route path={path}>
      {(params) => {
        const { isAuthenticated, isLoading } = useAuthStore();
        
        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }
        
        if (!isAuthenticated) {
          return <Redirect to="/auth" />;
        }
        
        return <Component params={params} />;
      }}
    </Route>
  );
}