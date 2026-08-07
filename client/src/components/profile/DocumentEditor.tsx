import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Save, Trash2 } from "lucide-react";
import { Document } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DocumentEditorProps {
  userId: number;
}

const plainTextContent = (value: string) => {
  if (!value.includes("<")) return value;
  const container = window.document.createElement("div");
  container.innerHTML = value;
  return container.textContent ?? "";
};

const DocumentEditor = ({ userId }: DocumentEditorProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const queryKey = ["/api/users", userId, "documents"] as const;

  const documentsQuery = useQuery<Document[]>({
    queryKey,
    enabled: userId > 0,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/users/${userId}/documents`);
      return response.json();
    },
  });

  const activeDocument = useMemo(() => {
    const documents = documentsQuery.data ?? [];
    return documents.find((document) => document.id === selectedId) ?? documents[0] ?? null;
  }, [documentsQuery.data, selectedId]);

  useEffect(() => {
    if (!activeDocument) {
      setTitle("");
      setContent("");
      return;
    }
    setSelectedId(activeDocument.id);
    setTitle(activeDocument.title);
    setContent(plainTextContent(activeDocument.content));
  }, [activeDocument?.id]);

  const createDocument = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/documents", { title: "Untitled document", content: "" });
      return response.json() as Promise<Document>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey });
      setSelectedId(created.id);
      toast({ title: "Document created", description: "Name it and start drafting." });
    },
    onError: (error: Error) => toast({ title: "Document was not created", description: error.message, variant: "destructive" }),
  });

  const saveDocument = useMutation({
    mutationFn: async () => {
      if (!activeDocument) throw new Error("Choose a document first");
      const response = await apiRequest("PUT", `/api/documents/${activeDocument.id}`, { title: title.trim(), content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Document saved" });
    },
    onError: (error: Error) => toast({ title: "Document was not saved", description: error.message, variant: "destructive" }),
  });

  const deleteDocument = useMutation({
    mutationFn: async () => {
      if (!activeDocument || !window.confirm(`Delete “${activeDocument.title}”?`)) return false;
      await apiRequest("DELETE", `/api/documents/${activeDocument.id}`);
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) return;
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Document deleted" });
    },
    onError: (error: Error) => toast({ title: "Document was not deleted", description: error.message, variant: "destructive" }),
  });

  const normalizedActiveContent = activeDocument ? plainTextContent(activeDocument.content) : "";
  const isDirty = Boolean(activeDocument) && (title !== activeDocument?.title || content !== normalizedActiveContent);

  if (documentsQuery.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-20 rounded-2xl bg-zinc-900" /><Skeleton className="h-80 rounded-2xl bg-zinc-900" /></div>;
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Creative documents</h2>
          <p className="mt-1 text-sm text-zinc-500">Draft briefs, scripts, offers, and working notes.</p>
        </div>
        <Button size="sm" className="rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => createDocument.mutate()} disabled={createDocument.isPending}>
          <FilePlus2 className="mr-2 h-4 w-4" /> New
        </Button>
      </div>

      {documentsQuery.isError && <p className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">Documents could not be loaded. Refresh to try again.</p>}

      {(documentsQuery.data?.length ?? 0) > 0 && (
        <nav aria-label="Your documents" className="mt-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2">
            {documentsQuery.data?.map((item) => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-44 rounded-2xl border p-3 text-left ${item.id === activeDocument?.id ? "border-white bg-white text-black" : "border-zinc-800 bg-zinc-950 text-white"}`}>
                <FileText className="h-4 w-4" />
                <span className="mt-2 block truncate text-sm font-bold">{item.title}</span>
                <span className={`mt-1 block text-[11px] ${item.id === activeDocument?.id ? "text-black/60" : "text-zinc-600"}`}>Updated {new Date(item.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {activeDocument ? (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center gap-2">
            <Input aria-label="Document title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-auto border-0 bg-transparent px-0 text-lg font-bold text-white focus-visible:ring-0" />
            {isDirty && <span className="shrink-0 text-[11px] font-semibold text-amber-400">Unsaved</span>}
          </div>
          <Textarea aria-label="Document content" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Start writing…" className="mt-3 min-h-[360px] resize-y border-zinc-800 bg-black leading-7 text-white placeholder:text-zinc-700" />
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" className="text-zinc-500 hover:bg-red-950 hover:text-red-300" onClick={() => deleteDocument.mutate()} disabled={deleteDocument.isPending}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
            <Button className="bg-white text-black hover:bg-zinc-200" onClick={() => saveDocument.mutate()} disabled={!title.trim() || !isDirty || saveDocument.isPending}><Save className="mr-2 h-4 w-4" /> {saveDocument.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      ) : !documentsQuery.isError ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-700" />
          <p className="mt-3 text-sm font-semibold text-zinc-300">Your workspace is empty</p>
          <p className="mt-1 text-xs text-zinc-600">Create a document for the next idea you want to ship.</p>
        </div>
      ) : null}
    </section>
  );
};

export default DocumentEditor;
