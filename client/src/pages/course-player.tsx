import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, CirclePlay, ClipboardCheck, FileText, LockKeyhole, Share2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Product, Purchase } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type Assessment = { id: string; passingScorePercent: number; questions: Array<{ id: string; prompt: string; choices: string[] }> };
type Curriculum = { modules: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string; body: string; durationSeconds: number; videoUrl: string | null; resourceUrls: string[]; locked: boolean; unlockAt: string | null; assessment: Assessment | null }> }> };
type Lesson = { id: string; module: string; title: string; body: string; duration: string; videoUrl: string | null; resourceUrls: string[]; locked: boolean; unlockAt: string | null; assessment: Assessment | null };
const duration = (seconds: number) => seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Lesson";
const unlockLabel = (unlockAt: string | null) => unlockAt ? `Opens ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(unlockAt))}` : "Locked";

export default function CoursePlayer() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { user } = useAuth();
  const client = useQueryClient();
  const { toast } = useToast();
  const [activeId, setActiveId] = useState("");
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [assessmentSubmitting, setAssessmentSubmitting] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<{ scorePercent: number; passed: boolean; passingScorePercent: number } | null>(null);
  const productQuery = useQuery<Product>({ queryKey: ["/api/products", productId], queryFn: async () => {
    const publicResponse = await fetch(`/api/products/${productId}`);
    if (publicResponse.ok) return publicResponse.json();

    // Draft and archived offers are deliberately invisible to the public.
    // Their owner still needs the exact same learner preview before publishing.
    if (publicResponse.status === 404) {
      const ownerResponse = await fetch(`/api/products/${productId}/manage`, { credentials: "include" });
      if (ownerResponse.ok) return ownerResponse.json();
    }

    throw new Error("Course not found");
  } });
  const purchasesQuery = useQuery<Purchase[]>({ queryKey: ["/api/purchases"] });
  const curriculumQuery = useQuery<Curriculum>({ queryKey: ["/api/courses", productId, "curriculum"], enabled: Boolean(user) && Number.isInteger(productId), queryFn: async () => { const r = await fetch(`/api/courses/${productId}/curriculum`, { credentials: "include" }); if (!r.ok) throw new Error("Curriculum unavailable"); return r.json(); } });
  const progressQuery = useQuery<{ lessonId: string }[]>({ queryKey: ["/api/courses", productId, "progress"], enabled: Boolean(user) && Number.isInteger(productId), queryFn: async () => { const r = await fetch(`/api/courses/${productId}/progress`, { credentials: "include" }); if (!r.ok) throw new Error("Progress unavailable"); return r.json(); } });
  const product = productQuery.data;
  const hasAccess = Boolean(product && (product.userId === user?.id || purchasesQuery.data?.some((purchase) => purchase.productId === product.id && purchase.status === "active")));
  const lessons = useMemo<Lesson[]>(() => curriculumQuery.data?.modules.flatMap((module) => module.lessons.map((lesson) => ({ id: lesson.id, module: module.title, title: lesson.title, body: lesson.body, duration: duration(lesson.durationSeconds), videoUrl: lesson.videoUrl, resourceUrls: lesson.resourceUrls, locked: lesson.locked, unlockAt: lesson.unlockAt, assessment: lesson.assessment }))) ?? [], [curriculumQuery.data]);
  const active = lessons.find((lesson) => lesson.id === activeId) ?? lessons.find((lesson) => !lesson.locked) ?? lessons[0];
  const completed = progressQuery.data?.map((record) => record.lessonId) ?? [];
  const completion = lessons.length ? Math.round((completed.length / lessons.length) * 100) : 0;
  const markComplete = async () => { if (!active || active.locked || completed.includes(active.id)) return; try { const response = await fetch(`/api/courses/${productId}/progress`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ lessonId: active.id }) }); if (!response.ok) throw new Error(); await client.invalidateQueries({ queryKey: ["/api/courses", productId, "progress"] }); toast({ title: "Lesson complete", description: "Your progress has been saved." }); } catch { toast({ title: "Could not save progress", variant: "destructive" }); } };
  const shareCourse = async () => {
    if (!product) return;
    const shareData = { title: product.title, url: window.location.href };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      toast({ title: "Course link copied", description: "Share it with another learner." });
    } catch {
      toast({ title: "Course link", description: shareData.url });
    }
  };
  const submitAssessment = async () => { if (!active?.assessment || active.locked) return; setAssessmentSubmitting(true); try { const response = await fetch(`/api/courses/${productId}/lessons/${active.id}/assessment/attempts`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ answers }) }); const result = await response.json(); if (!response.ok) throw new Error(result.message); setAssessmentResult(result); toast({ title: result.passed ? "Knowledge check passed" : "Try again", description: `${result.scorePercent}% — passing is ${result.passingScorePercent}%` }); } catch (error) { toast({ title: "Could not submit knowledge check", description: error instanceof Error ? error.message : undefined, variant: "destructive" }); } finally { setAssessmentSubmitting(false); } };
  if (productQuery.isLoading || purchasesQuery.isLoading) return <Skeleton className="m-4 h-[560px] bg-zinc-900" />;
  if (!product || !product.category.toLowerCase().includes("course")) return <main className="min-h-dvh bg-black p-4 text-white"><Button variant="ghost" onClick={() => setLocation("/marketplace")}>Back to marketplace</Button><p className="mt-8 text-zinc-500">This learning experience is not available.</p></main>;
  if (!hasAccess) return <main className="min-h-dvh bg-black p-4 text-white"><Button variant="ghost" className="text-zinc-400" onClick={() => setLocation(`/marketplace/product/${productId}`)}><ArrowLeft className="mr-2 h-4 w-4" /> Course details</Button><section className="mx-auto mt-24 max-w-sm text-center"><LockKeyhole className="mx-auto h-8 w-8 text-zinc-500" /><h1 className="mt-5 text-xl font-bold">Enroll to continue</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Purchase this course to access its curriculum and track your progress.</p></section></main>;
  if (curriculumQuery.isLoading) return <Skeleton className="m-4 h-[560px] bg-zinc-900" />;
  if (lessons.length === 0) return <main className="min-h-dvh bg-black p-4 text-white"><Button variant="ghost" className="text-zinc-400" onClick={() => setLocation(`/marketplace/product/${productId}`)}><ArrowLeft className="mr-2 h-4 w-4" /> Course details</Button><section className="mx-auto mt-24 max-w-sm text-center"><FileText className="mx-auto h-8 w-8 text-zinc-500" /><h1 className="mt-5 text-xl font-bold">Curriculum coming soon</h1><p className="mt-2 text-sm leading-6 text-zinc-500">The creator has not published lessons yet.</p></section></main>;
  const modules = Array.from(new Set(lessons.map((lesson) => lesson.module)));
  return <main className="min-h-dvh bg-black pb-20 text-white"><header className="flex h-14 items-center gap-2 border-b border-zinc-800 px-3"><Button variant="ghost" size="icon" className="text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")} aria-label="Back to marketplace"><ArrowLeft className="h-5 w-5" /></Button><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{product.title}</p><p className="text-[11px] text-zinc-500">{completion}% complete</p></div><Button variant="ghost" size="icon" className="text-zinc-400" onClick={() => void shareCourse()} aria-label="Share course"><Share2 className="h-4 w-4" /></Button></header><section className="border-b border-zinc-800"><div className="relative aspect-video bg-zinc-950">{!active?.locked && active?.videoUrl ? <video src={active.videoUrl} controls className="h-full w-full object-cover" /> : product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover opacity-40" /> : null}<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 to-black/10" />{active?.locked && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><LockKeyhole className="h-8 w-8 text-white" /><p className="text-sm font-semibold">{unlockLabel(active.unlockAt)}</p></div>}<p className="absolute bottom-4 left-4 right-4 text-sm font-bold">{active?.title}</p></div><div className="px-4 py-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{active?.module}</p><h1 className="mt-2 text-xl font-bold">{active?.title}</h1>{active?.locked ? <p className="mt-2 text-sm leading-6 text-zinc-500">This lesson and its resources will be available on its scheduled release date.</p> : <><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{active?.body}</p><div className="mt-4 flex flex-wrap gap-2"><Button className="rounded-xl bg-white text-black hover:bg-zinc-200" onClick={markComplete}><CheckCircle2 className="mr-2 h-4 w-4" /> {completed.includes(active?.id ?? "") ? "Completed" : "Mark complete"}</Button><Button variant="secondary" className="rounded-xl border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800" onClick={() => setResourcesOpen(true)}><FileText className="mr-2 h-4 w-4" /> Resources</Button></div>{active?.assessment && <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /><h2 className="text-sm font-bold">Knowledge check</h2></div><p className="mt-1 text-xs text-zinc-500">Pass with {active.assessment.passingScorePercent}% or higher.</p><div className="mt-4 space-y-4">{active.assessment.questions.map((question) => <fieldset key={question.id}><legend className="text-sm font-semibold">{question.prompt}</legend><div className="mt-2 space-y-2">{question.choices.map((choice, index) => <label key={`${question.id}-${index}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-300"><input type="radio" name={question.id} checked={answers[question.id] === index} onChange={() => { setAnswers((current) => ({ ...current, [question.id]: index })); setAssessmentResult(null); }} />{choice}</label>)}</div></fieldset>)}</div><Button className="mt-4 bg-white text-black hover:bg-zinc-200" disabled={assessmentSubmitting || active.assessment.questions.some((question) => answers[question.id] === undefined)} onClick={submitAssessment}>{assessmentSubmitting ? "Checking…" : "Submit answers"}</Button>{assessmentResult && <p className={`mt-3 text-sm ${assessmentResult.passed ? "text-emerald-400" : "text-amber-300"}`}>{assessmentResult.passed ? "Passed" : "Not yet passed"}: {assessmentResult.scorePercent}%</p>}</section>}</>}</div></section><section className="p-4"><div className="mb-4 flex items-end justify-between"><h2 className="text-base font-bold">Course content</h2><span className="text-xs text-zinc-500">{completed.length}/{lessons.length} lessons</span></div>{modules.map((module) => <div key={module} className="mb-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"><div className="flex items-center justify-between px-4 py-3 text-sm font-bold"><span>{module}</span><ChevronDown className="h-4 w-4 text-zinc-500" /></div>{lessons.filter((lesson) => lesson.module === module).map((lesson) => <button key={lesson.id} disabled={lesson.locked} onClick={() => { setActiveId(lesson.id); setAnswers({}); setAssessmentResult(null); }} className={`flex w-full items-center gap-3 border-t border-zinc-800 px-4 py-3 text-left ${lesson.id === active?.id ? "bg-zinc-900" : "hover:bg-zinc-900/70"} ${lesson.locked ? "cursor-not-allowed opacity-55" : ""}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${completed.includes(lesson.id) ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"}`}>{lesson.locked ? <LockKeyhole className="h-3.5 w-3.5" /> : completed.includes(lesson.id) ? <CheckCircle2 className="h-4 w-4" /> : <CirclePlay className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{lesson.title}</span><span className="mt-0.5 block text-xs text-zinc-500">{lesson.locked ? unlockLabel(lesson.unlockAt) : lesson.duration}</span></span><ChevronRight className="h-4 w-4 text-zinc-600" /></button>)}</div>)}</section><Dialog open={resourcesOpen} onOpenChange={setResourcesOpen}><DialogContent className="border-zinc-800 bg-zinc-950 text-white"><DialogHeader><DialogTitle>Lesson resources</DialogTitle><DialogDescription className="text-zinc-400">Resources for {active?.title}</DialogDescription></DialogHeader>{(active?.resourceUrls ?? []).length ? <div className="space-y-2">{active!.resourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block rounded-xl border border-zinc-800 bg-black p-3 text-sm font-semibold underline">Open lesson resource</a>)}</div> : <p className="text-sm text-zinc-500">No downloadable resources for this lesson.</p>}</DialogContent></Dialog></main>;
}
