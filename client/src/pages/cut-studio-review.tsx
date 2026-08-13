import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, MessageSquare, Send, XCircle } from "lucide-react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";

type ReviewComment = { id: string; authorName: string; body: string; positionMs: number; status: "open" | "resolved"; createdAt: string };
type ReviewDecision = { id: string; reviewerName: string; decision: "approved" | "changes_requested"; note?: string | null; createdAt: string };
type ReviewPayload = {
  project: { name: string; duration: number; mediaKind: "video" | "audio" };
  version: { id: string; label: string; revision: number; reviewStatus: "pending" | "approved" | "changes_requested"; createdAt: string };
  review: { label: string; expiresAt: string };
  media: { url: string; expiresAt?: string } | null;
  comments: ReviewComment[];
  decisions: ReviewDecision[];
};

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CutStudioReviewPage() {
  const { token = "" } = useParams<{ token: string }>();
  const player = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [positionMs, setPositionMs] = useState(0);
  const [decisionNote, setDecisionNote] = useState("");

  const load = async () => {
    const response = await fetch(`/api/cut/reviews/${encodeURIComponent(token)}`, { credentials: "omit" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message ?? "This review is unavailable");
    setReview(result as ReviewPayload);
  };

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "This review is unavailable")); }, [token]);

  const addComment = async () => {
    if (!name.trim() || !body.trim()) return;
    setBusy("comment"); setError("");
    try {
      const response = await fetch(`/api/cut/reviews/${encodeURIComponent(token)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorName: name, body, positionMs }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? "The note could not be added");
      setBody(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The note could not be added"); }
    finally { setBusy(""); }
  };

  const decide = async (decision: "approved" | "changes_requested") => {
    if (!name.trim()) return setError("Enter your name before submitting a decision");
    setBusy(decision); setError("");
    try {
      const response = await fetch(`/api/cut/reviews/${encodeURIComponent(token)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewerName: name, decision, note: decisionNote || undefined }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? "The decision could not be submitted");
      setDecisionNote(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The decision could not be submitted"); }
    finally { setBusy(""); }
  };

  if (error && !review) return <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white"><section className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center"><XCircle className="mx-auto h-10 w-10 text-red-400"/><h1 className="mt-4 text-xl font-bold">Review unavailable</h1><p className="mt-2 text-sm leading-6 text-zinc-400">{error}</p></section></main>;
  if (!review) return <main className="flex min-h-screen items-center justify-center bg-black text-white"><Loader2 className="h-8 w-8 animate-spin text-[#1d9bf0]"/></main>;

  return <main className="min-h-screen bg-black text-white">
    <header className="border-b border-zinc-800 bg-zinc-950 px-4 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#1d9bf0]">CreativesOS review</p><h1 className="mt-1 text-xl font-bold">{review.project.name} · {review.version.label}</h1></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${review.version.reviewStatus === "approved" ? "bg-emerald-950 text-emerald-300" : review.version.reviewStatus === "changes_requested" ? "bg-amber-950 text-amber-300" : "bg-zinc-800 text-zinc-300"}`}>{review.version.reviewStatus.replace("_", " ")}</span></div></header>
    <div className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <div className="flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">{review.media ? review.project.mediaKind === "audio" ? <audio ref={(node) => { player.current = node; }} className="w-[90%]" src={review.media.url} controls onTimeUpdate={(event) => setPositionMs(Math.round(event.currentTarget.currentTime * 1_000))}/> : <video ref={(node) => { player.current = node; }} className="max-h-[70vh] w-full bg-black object-contain" src={review.media.url} controls onTimeUpdate={(event) => setPositionMs(Math.round(event.currentTarget.currentTime * 1_000))}/> : <p className="text-sm text-zinc-500">The review render is unavailable.</p>}</div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#1d9bf0]"/><h2 className="font-bold">Add a time-coded note</h2><button className="ml-auto rounded bg-zinc-900 px-2 py-1 text-xs font-bold text-[#1d9bf0]" onClick={() => setPositionMs(Math.round((player.current?.currentTime ?? 0) * 1_000))}>{formatTime(positionMs)}</button></div><div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr]"><input aria-label="Your name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-[#1d9bf0]"/><textarea aria-label="Review note" value={body} onChange={(event) => setBody(event.target.value)} placeholder="What should change at this moment?" className="min-h-20 rounded-xl border border-zinc-700 bg-black p-3 text-sm outline-none focus:border-[#1d9bf0]"/></div><Button className="mt-2" disabled={!name.trim() || !body.trim() || busy === "comment"} onClick={() => void addComment()}>{busy === "comment" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}Add note</Button></div>
        {error && <p role="alert" className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Review decision</h2><p className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><Clock3 className="h-3 w-3"/>Expires {new Date(review.review.expiresAt).toLocaleDateString()}</p><textarea aria-label="Decision note" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Optional final note" className="mt-3 min-h-20 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm outline-none focus:border-[#1d9bf0]"/><div className="mt-2 grid grid-cols-2 gap-2"><Button className="bg-emerald-500 text-black hover:bg-emerald-400" disabled={Boolean(busy)} onClick={() => void decide("approved")}><CheckCircle2 className="mr-1.5 h-4 w-4"/>Approve</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void decide("changes_requested")}><XCircle className="mr-1.5 h-4 w-4"/>Changes</Button></div></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Notes · {review.comments.filter((item) => item.status === "open").length} open</h2><div className="mt-3 space-y-2">{review.comments.length ? review.comments.map((comment) => <button key={comment.id} className={`w-full rounded-xl border p-3 text-left ${comment.status === "resolved" ? "border-zinc-900 opacity-50" : "border-zinc-800 bg-black"}`} onClick={() => { if (player.current) player.current.currentTime = comment.positionMs / 1_000; setPositionMs(comment.positionMs); }}><span className="text-xs font-bold text-[#1d9bf0]">{formatTime(comment.positionMs)}</span><p className="mt-1 text-sm">{comment.body}</p><p className="mt-2 text-[11px] text-zinc-600">{comment.authorName}</p></button>) : <p className="py-6 text-center text-sm text-zinc-600">No notes yet.</p>}</div></div>
        {review.decisions.length > 0 && <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h2 className="font-bold">Decision history</h2><div className="mt-3 space-y-2">{review.decisions.map((decision) => <div key={decision.id} className="rounded-xl bg-black p-3 text-xs"><p className="font-bold">{decision.reviewerName} · {decision.decision.replace("_", " ")}</p>{decision.note && <p className="mt-1 text-zinc-400">{decision.note}</p>}</div>)}</div></div>}
      </aside>
    </div>
  </main>;
}
