import { useMemo, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, ClipboardCheck, Link2, Plus, Send, Users, Video } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Lesson = { id: string; title: string; body: string; videoUrl: string | null; resourceUrls: string[]; durationSeconds: number; availableAfterDays: number; isPublished: boolean; assessment?: { id: string; questions: unknown[] } | null };
type Curriculum = { product: { title: string; communityId: number | null }; modules: Array<{ id: string; title: string; description: string; lessons: Lesson[] }> };
type OwnedCommunity = { id: number; name: string; description: string };
const minuteLabel = (seconds: number) => seconds ? `${Math.max(1, Math.round(seconds / 60))} min` : "No duration";

export default function CourseBuilder() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { toast } = useToast();
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleDescription, setModuleDescription] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonBody, setLessonBody] = useState("");
  const [lessonVideoUrl, setLessonVideoUrl] = useState("");
  const [lessonResources, setLessonResources] = useState("");
  const [lessonMinutes, setLessonMinutes] = useState("");
  const [lessonReleaseDays, setLessonReleaseDays] = useState("0");
  const [moduleId, setModuleId] = useState("");
  const [quizLessonId, setQuizLessonId] = useState("");
  const [quizPrompt, setQuizPrompt] = useState("");
  const [quizChoices, setQuizChoices] = useState("");
  const [quizAnswer, setQuizAnswer] = useState("0");
  const [quizPassScore, setQuizPassScore] = useState("70");
  const curriculum = useQuery<Curriculum>({ queryKey: ["/api/courses", productId, "curriculum"], queryFn: async () => (await apiRequest("GET", `/api/courses/${productId}/curriculum`)).json() });
  const ownedCommunities = useQuery<OwnedCommunity[]>({ queryKey: ["/api/communities/owned"], queryFn: async () => (await apiRequest("GET", "/api/communities/owned")).json() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/courses", productId, "curriculum"] });
  const addModule = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/courses/${productId}/modules`, { title: moduleTitle, description: moduleDescription })).json(),
    onSuccess: (module) => { setModuleTitle(""); setModuleDescription(""); setModuleId(module.id); refresh(); },
    onError: (error: Error) => toast({ title: "Could not add module", description: error.message, variant: "destructive" }),
  });
  const addLesson = useMutation({
    mutationFn: async (targetModuleId: string) => (await apiRequest("POST", `/api/courses/${productId}/modules/${targetModuleId}/lessons`, {
      title: lessonTitle, body: lessonBody, videoUrl: lessonVideoUrl.trim() || null,
      resourceUrls: lessonResources.split("\n").map((url) => url.trim()).filter(Boolean),
      durationSeconds: Math.round(Math.max(0, Number(lessonMinutes) || 0) * 60),
      availableAfterDays: Math.min(3650, Math.max(0, Math.floor(Number(lessonReleaseDays) || 0))),
      isPublished: false,
    })).json(),
    onSuccess: () => { setLessonTitle(""); setLessonBody(""); setLessonVideoUrl(""); setLessonResources(""); setLessonMinutes(""); setLessonReleaseDays("0"); refresh(); },
    onError: (error: Error) => toast({ title: "Could not add lesson", description: error.message, variant: "destructive" }),
  });
  const publish = useMutation({ mutationFn: async (lessonId: string) => (await apiRequest("PATCH", `/api/courses/${productId}/lessons/${lessonId}`, { isPublished: true })).json(), onSuccess: refresh, onError: (error: Error) => toast({ title: "Could not publish lesson", description: error.message, variant: "destructive" }) });
  const saveQuiz = useMutation({
    mutationFn: async (lessonId: string) => {
      const choices = quizChoices.split("\n").map((choice) => choice.trim()).filter(Boolean);
      return (await apiRequest("PUT", `/api/courses/${productId}/lessons/${lessonId}/assessment`, {
        passingScorePercent: Math.min(100, Math.max(0, Math.floor(Number(quizPassScore) || 70))),
        questions: [{ prompt: quizPrompt, choices, answerIndex: Math.max(0, Math.min(choices.length - 1, Number(quizAnswer) || 0)) }],
      })).json();
    },
    onSuccess: () => { setQuizPrompt(""); setQuizChoices(""); setQuizAnswer("0"); setQuizPassScore("70"); refresh(); toast({ title: "Knowledge check saved" }); },
    onError: (error: Error) => toast({ title: "Could not save knowledge check", description: error.message, variant: "destructive" }),
  });
  const linkCommunity = useMutation({
    mutationFn: async (communityId: string) => (await apiRequest("PUT", `/api/courses/${productId}/community`, { communityId: communityId ? Number(communityId) : null })).json(),
    onSuccess: (result) => { refresh(); toast({ title: result.communityId ? "Community linked" : "Community access removed", description: result.enrolledMembers ? `${result.enrolledMembers} existing learners were added.` : undefined }); },
    onError: (error: Error) => toast({ title: "Could not update community access", description: error.message, variant: "destructive" }),
  });
  const modules = curriculum.data?.modules ?? [];
  const selectedModule = moduleId || modules[0]?.id || "";
  const quizLessons = useMemo(() => modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))), [modules]);
  const selectedQuizLesson = quizLessonId || quizLessons[0]?.id || "";
  const answerChoices = quizChoices.split("\n").map((choice) => choice.trim()).filter(Boolean);

  return <main className="min-h-dvh bg-black pb-24 text-white">
    <header className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4"><Button variant="ghost" size="icon" className="-ml-2 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/business")}><ArrowLeft className="h-5 w-5" /></Button><div className="min-w-0 flex-1"><h1 className="truncate text-lg font-bold">{curriculum.data?.product.title ?? "Course builder"}</h1><p className="text-[11px] text-zinc-500">Build a complete learner journey.</p></div><Button size="sm" variant="outline" className="border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation(`/learn/${productId}`)}>Preview</Button></header>
    <section className="mx-auto max-w-3xl space-y-4 p-4">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><Users className="h-4 w-4" /><h2 className="text-sm font-bold">Learner community</h2></div><p className="mt-1 text-xs leading-5 text-zinc-500">Link one community you own. Verified course purchases automatically become community members; a ban remains in force.</p><select value={curriculum.data?.product.communityId ? String(curriculum.data.product.communityId) : ""} onChange={(event) => linkCommunity.mutate(event.target.value)} disabled={linkCommunity.isPending || ownedCommunities.isLoading} className="mt-3 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white"><option value="">No linked community</option>{(ownedCommunities.data ?? []).map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}</select>{(ownedCommunities.data ?? []).length === 0 && <p className="mt-2 text-xs text-zinc-500">Open a community first, then return here to include it with the course.</p>}</section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4" /><h2 className="text-sm font-bold">Create a module</h2></div><Input value={moduleTitle} onChange={(event) => setModuleTitle(event.target.value)} placeholder="Module title" className="mt-3 border-zinc-700 bg-black text-white" /><Textarea value={moduleDescription} onChange={(event) => setModuleDescription(event.target.value)} placeholder="What will learners get from this module?" className="mt-3 min-h-20 border-zinc-700 bg-black text-white" /><Button className="mt-3 w-full bg-white text-black hover:bg-zinc-200" disabled={!moduleTitle.trim() || addModule.isPending} onClick={() => addModule.mutate()}><Plus className="mr-2 h-4 w-4" />{addModule.isPending ? "Creating…" : "Add module"}</Button></section>
      {modules.length > 0 && <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="text-sm font-bold">Create a lesson</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Published lessons can release immediately or on a deliberate enrollment schedule.</p><select value={selectedModule} onChange={(event) => setModuleId(event.target.value)} className="mt-3 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white">{modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select><Input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} placeholder="Lesson title" className="mt-3 border-zinc-700 bg-black text-white" /><Textarea value={lessonBody} onChange={(event) => setLessonBody(event.target.value)} placeholder="Write the lesson material…" className="mt-3 min-h-36 border-zinc-700 bg-black text-white" /><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-zinc-400"><span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" /> Video URL</span><Input type="url" value={lessonVideoUrl} onChange={(event) => setLessonVideoUrl(event.target.value)} placeholder="https://…" className="mt-1 border-zinc-700 bg-black text-white" /></label><label className="text-xs font-semibold text-zinc-400"><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Duration (minutes)</span><Input inputMode="numeric" value={lessonMinutes} onChange={(event) => setLessonMinutes(event.target.value)} placeholder="10" className="mt-1 border-zinc-700 bg-black text-white" /></label><label className="text-xs font-semibold text-zinc-400"><span>Release after (days)</span><Input inputMode="numeric" value={lessonReleaseDays} onChange={(event) => setLessonReleaseDays(event.target.value)} placeholder="0" className="mt-1 border-zinc-700 bg-black text-white" /></label></div><label className="mt-3 block text-xs font-semibold text-zinc-400"><span className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Resources</span><Textarea value={lessonResources} onChange={(event) => setLessonResources(event.target.value)} placeholder="One secure URL per line" className="mt-1 min-h-20 border-zinc-700 bg-black text-white" /></label><Button className="mt-4 w-full bg-white text-black hover:bg-zinc-200" disabled={!selectedModule || !lessonTitle.trim() || addLesson.isPending} onClick={() => addLesson.mutate(selectedModule)}><Plus className="mr-2 h-4 w-4" />{addLesson.isPending ? "Creating…" : "Add draft lesson"}</Button></section>}
      {quizLessons.length > 0 && <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /><h2 className="text-sm font-bold">Knowledge check</h2></div><p className="mt-1 text-xs leading-5 text-zinc-500">Attach a one-question check now; saving again replaces the lesson’s current check.</p><select value={selectedQuizLesson} onChange={(event) => setQuizLessonId(event.target.value)} className="mt-3 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white">{quizLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle} — {lesson.title}</option>)}</select><Textarea value={quizPrompt} onChange={(event) => setQuizPrompt(event.target.value)} placeholder="Question prompt" className="mt-3 min-h-20 border-zinc-700 bg-black text-white" /><Textarea value={quizChoices} onChange={(event) => setQuizChoices(event.target.value)} placeholder="One answer choice per line (at least two)" className="mt-3 min-h-20 border-zinc-700 bg-black text-white" /><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-zinc-400">Correct choice<select value={quizAnswer} onChange={(event) => setQuizAnswer(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white">{answerChoices.map((choice, index) => <option key={`${choice}-${index}`} value={index}>{index + 1}. {choice}</option>)}</select></label><label className="text-xs font-semibold text-zinc-400">Passing score (%)<Input inputMode="numeric" value={quizPassScore} onChange={(event) => setQuizPassScore(event.target.value)} className="mt-1 border-zinc-700 bg-black text-white" /></label></div><Button className="mt-4 w-full bg-white text-black hover:bg-zinc-200" disabled={!selectedQuizLesson || !quizPrompt.trim() || answerChoices.length < 2 || saveQuiz.isPending} onClick={() => saveQuiz.mutate(selectedQuizLesson)}><CheckCircle2 className="mr-2 h-4 w-4" />{saveQuiz.isPending ? "Saving…" : "Save knowledge check"}</Button></section>}
      <section><div className="flex items-end justify-between"><h2 className="text-base font-bold">Curriculum</h2><span className="text-xs text-zinc-500">{modules.reduce((count, module) => count + module.lessons.length, 0)} lessons</span></div>{modules.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">Start with your first module, then add its lessons.</p> : <div className="mt-3 space-y-3">{modules.map((module) => <article key={module.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"><div className="px-4 py-3"><h3 className="text-sm font-bold">{module.title}</h3>{module.description && <p className="mt-1 text-xs leading-5 text-zinc-500">{module.description}</p>}</div>{module.lessons.length === 0 ? <p className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">No lessons yet.</p> : module.lessons.map((lesson) => <div key={lesson.id} className="flex items-center gap-3 border-t border-zinc-800 px-4 py-3"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{lesson.title}</span><span className="mt-1 block text-[11px] text-zinc-500">{lesson.isPublished ? "Published" : "Draft"} · {minuteLabel(lesson.durationSeconds)}{lesson.availableAfterDays ? ` · Day ${lesson.availableAfterDays}` : " · Immediate"}{lesson.videoUrl ? " · Video" : ""}{lesson.resourceUrls.length ? ` · ${lesson.resourceUrls.length} resources` : ""}{lesson.assessment ? " · Quiz" : ""}</span></span>{!lesson.isPublished && <Button size="sm" className="h-8 rounded-lg bg-white text-xs text-black" disabled={publish.isPending} onClick={() => publish.mutate(lesson.id)}><Send className="mr-1 h-3.5 w-3.5" /> Publish</Button>}</div>)}</article>)}</div>}</section>
    </section>
  </main>;
}
