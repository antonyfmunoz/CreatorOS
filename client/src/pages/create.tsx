import { ArrowLeft, BookOpen, Bot, CalendarPlus, FileText, Film, FolderOpen, Image, LayoutDashboard, Megaphone, Mic, PackagePlus, Radio, Repeat2, Send, Sparkles, Video } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

type CreateOption = {
  title: string;
  description: string;
  icon: typeof FileText;
  href: string;
  accent: string;
};

type ContentDraft = {
  id: string;
  content: string;
  kind: string;
  updatedAt: string;
};

const postOptions: CreateOption[] = [
  { title: "Write a post", description: "Share an update, idea, or launch.", icon: FileText, href: "/new-text-post", accent: "bg-zinc-800 text-white" },
  { title: "Photo post", description: "Upload an image to your feed.", icon: Image, href: "/create/post?type=photo", accent: "bg-zinc-800 text-white" },
  { title: "Video post", description: "Publish a video from your device.", icon: Video, href: "/create/post?type=video", accent: "bg-zinc-800 text-white" },
  { title: "Audio post", description: "Record a quick audio update.", icon: Mic, href: "/create/post?type=audio", accent: "bg-zinc-800 text-white" },
];

export default function CreatePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const draftsQuery = useQuery<ContentDraft[]>({
    queryKey: ["/api/content-drafts"],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/content-drafts");
      return response.json();
    },
  });
  const drafts = draftsQuery.data?.slice(0, 3) ?? [];

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-20 text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-zinc-800 bg-black px-4">
        <Button variant="ghost" size="icon" className="-ml-2 mr-1 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/")} aria-label="Back to explore">
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
              <button key={option.title} onClick={() => setLocation(option.href)} className="min-h-36 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${option.accent}`}><Icon className="h-5 w-5" /></div>
                <h2 className="mt-4 text-sm font-bold">{option.title}</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{option.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="px-4 pt-8">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Continue creating</p>
          <div className="mt-3 space-y-2">
            {drafts.map((draft) => (
              <button
                key={draft.id}
                onClick={() => setLocation(`/new-text-post?draft=${draft.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800"><FileText className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{draft.content.trim() || "Untitled draft"}</span>
                  <span className="mt-1 block text-xs text-zinc-500">{draft.kind} draft · edited {new Date(draft.updatedAt).toLocaleDateString()}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="px-4 pt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Build your business</p>
        <button onClick={() => setLocation("/business")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><LayoutDashboard className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open business dashboard</span><span className="mt-1 block text-xs leading-5 text-zinc-500">See offers, revenue, audience, and your next business action.</span></span>
        </button>
        <button onClick={() => setLocation("/studio")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><Send className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open distribution studio</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Compose once, schedule content, and manage your publishing queue.</span></span>
        </button>
        <button onClick={() => setLocation("/library")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><FolderOpen className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open Media Cloud</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Upload once, organize collections, inspect processing, and reuse media across every instrument.</span></span>
        </button>
        <button onClick={() => setLocation("/cut-studio")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1d9bf0] text-black"><Film className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open CutStudio</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Edit video by timeline or transcript, generate clips, add captions, and prepare distribution-ready renders.</span></span>
        </button>
        <button onClick={() => setLocation("/broadcast")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600 text-white"><Radio className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open Broadcast Studio</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Direct scenes, cameras, screens, audio, recordings, replay, and live stream outputs from one production desk.</span></span>
        </button>
        <button onClick={() => setLocation("/campaigns")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><Megaphone className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Run a campaign</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Plan a launch, creator seeding, organic sprint, or paid-media brief.</span></span>
        </button>
        <button onClick={() => setLocation("/ugc")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-[#1d9bf0]/50 bg-[#1d9bf0]/10 p-4 text-left transition-colors hover:bg-[#1d9bf0]/15">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1d9bf0] text-black"><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open UGC Studio</span><span className="mt-1 block text-xs leading-5 text-zinc-400">Find brand briefs, recruit creators, review private versions, and track performance-based earnings.</span></span>
        </button>
        <button onClick={() => setLocation("/ai")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><Bot className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Open AI workspace</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Build specialized assistants for drafts, research, and creator operations.</span></span>
        </button>
        <button onClick={() => setLocation("/automations")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><Repeat2 className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Build an automation</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Run repeatable creator workflows with approvals, recovery, and a complete activity record.</span></span>
        </button>
        <button onClick={() => setLocation("/create-product")} className="mt-3 flex w-full items-center gap-4 rounded-2xl bg-[#1d9bf0] p-4 text-left text-black transition-opacity hover:opacity-90">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/15"><PackagePlus className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Create an offer</span><span className="mt-1 block text-xs leading-5 text-black/75">Start a course, community, digital asset, coaching offer, or software product.</span></span>
          <BookOpen className="h-5 w-5 text-black/75" />
        </button>
      </section>

      <section className="px-4 pt-8">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Bring people together</p>
        <button onClick={() => setLocation("/create/event")} className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800"><CalendarPlus className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Create an event</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Schedule a community gathering and publish the announcement.</span></span>
        </button>
      </section>
    </main>
  );
}
