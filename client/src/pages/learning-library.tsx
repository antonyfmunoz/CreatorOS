import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, ChevronRight, PlayCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

type PurchaseWithProduct = {
  id: number;
  product: {
    id: number;
    title: string;
    description: string;
    category: string;
    imageUrl: string | null;
  };
};

export default function LearningLibraryPage() {
  const [, setLocation] = useLocation();
  const { data: purchases = [], isLoading } = useQuery<PurchaseWithProduct[]>({
    queryKey: ["/api/purchases"],
  });
  const courses = purchases.filter(({ product }) => product.category.toLowerCase().includes("course"));

  return <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
    <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4">
      <Button variant="ghost" size="icon" className="-ml-2 rounded-full text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")} aria-label="Back to marketplace"><ArrowLeft className="h-5 w-5" /></Button>
      <div><h1 className="text-lg font-bold">Your learning</h1><p className="text-[11px] text-zinc-500">Courses and programs you can continue.</p></div>
    </header>
    {isLoading ? <section className="space-y-3 p-4"><div className="h-24 animate-pulse rounded-2xl bg-zinc-900" /><div className="h-24 animate-pulse rounded-2xl bg-zinc-900" /></section> : courses.length === 0 ? <section className="mx-auto flex max-w-sm flex-col items-center px-6 py-24 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><BookOpen className="h-7 w-7 text-zinc-400" /></span><h2 className="mt-5 text-xl font-bold">Your library is waiting</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Enroll in a course from the marketplace and it will appear here.</p><Button className="mt-6 rounded-xl bg-white font-bold text-black hover:bg-zinc-200" onClick={() => setLocation("/marketplace")}>Browse courses</Button></section> : <section className="space-y-3 p-4">{courses.map(({ id, product }) => <button key={id} type="button" onClick={() => setLocation(`/learn/${product.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-left transition-colors hover:bg-zinc-900"><div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-900">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <PlayCircle className="h-7 w-7 text-zinc-400" />}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{product.title}</span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-zinc-500">{product.description}</span><span className="mt-2 inline-flex items-center text-xs font-bold text-white"><PlayCircle className="mr-1 h-3.5 w-3.5" /> Continue course</span></span><ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" /></button>)}</section>}
  </main>;
}
