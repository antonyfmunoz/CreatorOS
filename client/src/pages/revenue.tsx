import { useEffect } from "react";
import { useLocation } from "wouter";

// Preserve historical links without maintaining a second, conflicting money
// surface. Creator earnings is the account-backed source of truth.
export default function RevenueRedirectPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/earnings", { replace: true });
  }, [setLocation]);

  return <main className="min-h-dvh bg-black" aria-label="Opening creator earnings" />;
}
