import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-black px-4 pb-20 text-white">
      <Card className="w-full max-w-md border-zinc-800 bg-zinc-950 text-white">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold">Page not found</h1>
          </div>

          <p className="mt-4 text-sm leading-6 text-zinc-500">
            This CreativesOS page may have moved or may no longer be available.
          </p>
          <Button className="mt-6 w-full bg-white text-black hover:bg-zinc-200" onClick={() => setLocation("/")}>Back to Explore</Button>
        </CardContent>
      </Card>
    </main>
  );
}
