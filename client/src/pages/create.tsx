import { ArrowLeft, BookOpen, FileText, Image, Mic, PackagePlus, Video } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

type CreateOption = {
  title: string;
  description: string;
  icon: typeof FileText;
  href: string;
  accent: string;
};

const postOptions: CreateOption[] = [
  { title: "Write a post", description: "Share an update, idea, or launch.", icon: FileText, href: "/new-text-post", accent: "bg-violet-100 text-violet-700" },
  { title: "Photo post", description: "Upload an image to your feed.", icon: Image, href: "/create/post?type=photo", accent: "bg-pink-100 text-pink-700" },
  { title: "Video post", description: "Publish a video from your device.", icon: Video, href: "/create/post?type=video", accent: "bg-orange-100 text-orange-700" },
  { title: "Audio post", description: "Record a quick audio update.", icon: Mic, href: "/create/post?type=audio", accent: "bg-sky-100 text-sky-700" },
];

export default function CreatePage() {
  const [, setLocation] = useLocation();

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-white pb-20 text-black">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-zinc-100 bg-white px-4">
        <Button variant="ghost" size="icon" className="-ml-2 mr-1 rounded-full" onClick={() => setLocation("/")} aria-label="Back to explore">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">Create</h1>
      </header>

      <section className="px-4 pt-6">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Share with your audience</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {postOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button key={option.title} onClick={() => setLocation(option.href)} className="min-h-36 rounded-2xl border border-zinc-100 p-4 text-left transition-colors hover:bg-zinc-50">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${option.accent}`}><Icon className="h-5 w-5" /></div>
                <h2 className="mt-4 text-sm font-bold">{option.title}</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{option.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-4 pt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Build your business</p>
        <button onClick={() => setLocation("/create-product")} className="mt-3 flex w-full items-center gap-4 rounded-2xl bg-black p-4 text-left text-white transition-opacity hover:opacity-90">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><PackagePlus className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Create an offer</span><span className="mt-1 block text-xs leading-5 text-zinc-300">Start a course, community, digital asset, coaching offer, or software product.</span></span>
          <BookOpen className="h-5 w-5 text-zinc-300" />
        </button>
      </section>
    </main>
  );
}
