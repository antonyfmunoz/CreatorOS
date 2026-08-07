import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarClock,
  Check,
  Circle,
  Copy,
  ListChecks,
  NotebookPen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { buildRoomRecap } from "@/lib/room-recap";
import { roomDueDateLabel } from "@/lib/room-workspace";

type RoomNote = {
  id: string;
  authorUserId: number;
  authorDisplayName: string;
  authorUsername: string;
  content: string;
  visibility: string;
  createdAt: string;
};

type RoomActionItem = {
  id: string;
  assigneeUserId: number | null;
  assigneeDisplayName: string | null;
  assigneeUsername: string | null;
  body: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type CommunityMember = {
  userId: number;
  displayName: string;
  username: string;
  status: string;
};

function relativeTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "recently"
    : formatDistanceToNow(date, { addSuffix: true });
}

export function RoomWorkspacePanel({
  roomId,
  communityId,
  roomTitle,
  roomDescription,
  roomStartsAt,
}: {
  roomId: string;
  communityId: number;
  roomTitle: string;
  roomDescription: string;
  roomStartsAt: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const notesKey = ["/api/community-rooms", roomId, "notes"];
  const actionsKey = ["/api/community-rooms", roomId, "action-items"];
  const [note, setNote] = useState("");
  const [action, setAction] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");

  const copyRecap = async () => {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard access is not available in this browser");
    await navigator.clipboard.writeText(
      buildRoomRecap({
        title: roomTitle,
        description: roomDescription,
        startsAt: roomStartsAt,
        notes: notes.data ?? [],
        actions: actions.data ?? [],
      }),
    );
    toast({
      title: "Meeting recap copied",
      description: "The attributed notes and current follow-ups are ready to share where you choose.",
    });
  };

  const notes = useQuery<RoomNote[]>({
    queryKey: notesKey,
    queryFn: async () =>
      (await apiRequest("GET", `/api/community-rooms/${roomId}/notes`)).json(),
  });
  const actions = useQuery<RoomActionItem[]>({
    queryKey: actionsKey,
    queryFn: async () =>
      (await apiRequest("GET", `/api/community-rooms/${roomId}/action-items`)).json(),
  });
  const members = useQuery<CommunityMember[]>({
    queryKey: ["/api/communities", communityId, "members"],
    queryFn: async () =>
      (await apiRequest("GET", `/api/communities/${communityId}/members`)).json(),
  });

  const addNote = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/community-rooms/${roomId}/notes`, {
        content: note.trim(),
      })).json() as Promise<RoomNote>,
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: notesKey });
      toast({ title: "Room note saved", description: "Everyone in the room workspace can reference it." });
    },
    onError: (error: Error) =>
      toast({ title: "Room note was not saved", description: error.message, variant: "destructive" }),
  });

  const addAction = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/community-rooms/${roomId}/action-items`, {
        body: action.trim(),
        dueAt: dueAt || null,
        assigneeUserId: assigneeUserId ? Number(assigneeUserId) : null,
      })).json() as Promise<RoomActionItem>,
    onSuccess: () => {
      setAction("");
      setDueAt("");
      setAssigneeUserId("");
      queryClient.invalidateQueries({ queryKey: actionsKey });
      toast({ title: "Action item added", description: "The next step is now part of the durable room record." });
    },
    onError: (error: Error) =>
      toast({ title: "Action item was not added", description: error.message, variant: "destructive" }),
  });

  const updateAction = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) =>
      (await apiRequest(
        "PATCH",
        `/api/community-rooms/${roomId}/action-items/${id}`,
        { completed },
      )).json() as Promise<RoomActionItem>,
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: actionsKey });
      const previous = queryClient.getQueryData<RoomActionItem[]>(actionsKey);
      queryClient.setQueryData<RoomActionItem[]>(actionsKey, (current = []) =>
        current.map((item) =>
          item.id === id
            ? { ...item, completedAt: completed ? new Date().toISOString() : null }
            : item,
        ),
      );
      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(actionsKey, context.previous);
      toast({ title: "Action item was not updated", description: error.message, variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: actionsKey }),
  });

  const notesError = notes.error instanceof Error ? notes.error.message : "";
  const actionsError = actions.error instanceof Error ? actions.error.message : "";

  return (
    <section aria-label="Meeting workspace" className="mt-6 rounded-2xl border border-zinc-800 bg-black p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <NotebookPen className="h-4 w-4 text-cyan-400" /> Meeting workspace
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Keep decisions and follow-ups with the room, even before an AI or transcription provider is connected.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Shared memory
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"
            disabled={notes.isLoading || actions.isLoading || (!(notes.data?.length) && !(actions.data?.length))}
            onClick={() =>
              void copyRecap().catch((clipboardError: Error) =>
                toast({
                  title: "Meeting recap was not copied",
                  description: clipboardError.message,
                  variant: "destructive",
                }),
              )
            }
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy recap
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <NotebookPen className="h-3.5 w-3.5" /> Notes and decisions
          </p>
          <Textarea
            aria-label="New room note"
            value={note}
            maxLength={20_000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Capture a decision, useful context, or a key moment…"
            className="mt-3 min-h-24 resize-y border-zinc-800 bg-zinc-950"
          />
          <Button
            size="sm"
            className="mt-2 rounded-full bg-white text-black hover:bg-zinc-200"
            disabled={!note.trim() || addNote.isPending}
            onClick={() => addNote.mutate()}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {addNote.isPending ? "Saving…" : "Save note"}
          </Button>
          {notesError && <p role="alert" className="mt-3 text-xs text-red-300">{notesError}</p>}
          <div className="mt-4 space-y-2">
            {notes.isLoading ? (
              <p className="text-xs text-zinc-600">Loading room notes…</p>
            ) : notes.data?.length ? (
              notes.data.map((item) => (
                <article key={item.id} className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-3">
                  <p className="whitespace-pre-wrap text-xs leading-5 text-zinc-300">{item.content}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">
                    {item.authorDisplayName || item.authorUsername} · saved {relativeTime(item.createdAt)}
                  </p>
                </article>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-900 p-3 text-xs leading-5 text-zinc-600">
                No notes yet. Capture the first decision so it does not disappear after the call.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <ListChecks className="h-3.5 w-3.5" /> Action items
          </p>
          <Input
            aria-label="New action item"
            value={action}
            maxLength={2_000}
            onChange={(event) => setAction(event.target.value)}
            placeholder="What needs to happen next?"
            className="mt-3 border-zinc-800 bg-zinc-950"
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Action item due date"
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              onInput={(event) => setDueAt(event.currentTarget.value)}
              className="border-zinc-800 bg-zinc-950 [color-scheme:dark]"
            />
            <select
              aria-label="Assign action item"
              value={assigneeUserId}
              onChange={(event) => setAssigneeUserId(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 outline-none focus:border-zinc-600"
            >
              <option value="">Unassigned</option>
              {(members.data ?? [])
                .filter((member) => !["banned", "suspended"].includes(member.status))
                .map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName || member.username}
                  </option>
                ))}
            </select>
            <Button
              size="sm"
              className="h-10 shrink-0 rounded-full bg-white px-4 text-black hover:bg-zinc-200"
              disabled={!action.trim() || addAction.isPending}
              onClick={() => addAction.mutate()}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {addAction.isPending ? "Adding…" : "Add action"}
            </Button>
          </div>
          {actionsError && <p role="alert" className="mt-3 text-xs text-red-300">{actionsError}</p>}
          <div className="mt-4 space-y-2">
            {actions.isLoading ? (
              <p className="text-xs text-zinc-600">Loading action items…</p>
            ) : actions.data?.length ? (
              actions.data.map((item) => {
                const completed = Boolean(item.completedAt);
                const due = roomDueDateLabel(item.dueAt);
                return (
                  <article key={item.id} className="flex items-start gap-3 rounded-xl border border-zinc-900 bg-zinc-950/60 p-3">
                    <button
                      type="button"
                      aria-label={`${completed ? "Reopen" : "Complete"} action: ${item.body}`}
                      aria-pressed={completed}
                      disabled={updateAction.isPending}
                      onClick={() => updateAction.mutate({ id: item.id, completed: !completed })}
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:text-white disabled:opacity-50"
                    >
                      {completed ? <Check className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className={`text-xs leading-5 ${completed ? "text-zinc-600 line-through" : "text-zinc-300"}`}>{item.body}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-600">
                        {due && <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Due {due}</span>}
                        {item.assigneeUserId && (
                          <span>Owner {item.assigneeDisplayName || item.assigneeUsername || "community member"}</span>
                        )}
                        <span>{completed ? "Completed" : `Added ${relativeTime(item.createdAt)}`}</span>
                      </p>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="rounded-xl border border-dashed border-zinc-900 p-3 text-xs leading-5 text-zinc-600">
                No action items yet. Turn a meeting decision into an owned next step.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
