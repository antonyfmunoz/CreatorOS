import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileQuestion } from "lucide-react";
import { useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type PublicForm = {
  id: string;
  title: string;
  submitLabel: string;
  successMessage: string;
  fields: Array<{
    id: string;
    databaseFieldId: string;
    label: string;
    description?: string;
    required: boolean;
    type: string;
  }>;
};

export default function FoundationPublicFormPage() {
  const { id } = useParams<{ id: string }>();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const form = useQuery<PublicForm>({
    queryKey: ["/api/public/foundation/forms", id],
    queryFn: async () => (await apiRequest("GET", `/api/public/foundation/forms/${id}`)).json(),
    retry: false,
  });
  const submit = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/public/foundation/forms/${id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ values }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? "The form could not be submitted.");
      return response.json();
    },
  });

  if (form.isLoading) return <main className="flex min-h-screen items-center justify-center bg-black text-sm text-zinc-500">Loading form…</main>;
  if (form.isError || !form.data) return <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white"><div className="max-w-sm text-center"><FileQuestion className="mx-auto h-10 w-10 text-zinc-700" /><h1 className="mt-4 text-xl font-bold">This form is unavailable</h1><p className="mt-2 text-sm text-zinc-500">It may be private, archived, or no longer accepting responses.</p></div></main>;
  if (submit.isSuccess) return <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white"><div className="max-w-sm text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" /><h1 className="mt-4 text-2xl font-bold">Response received</h1><p className="mt-2 text-zinc-400">{form.data.successMessage}</p></div></main>;

  return <main className="min-h-screen bg-black px-4 py-12 text-white"><div className="mx-auto max-w-xl"><div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-600">CreativesOS Form</p><h1 className="mt-3 text-3xl font-black">{form.data.title}</h1><p className="mt-2 text-sm text-zinc-500">Your response is submitted without granting access to the underlying workspace database.</p></div><form className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 md:p-8" onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}>{form.data.fields.map((field) => <label key={field.id} className="block"><span className="text-sm font-bold">{field.label}{field.required && <span className="text-red-400"> *</span>}</span>{field.description && <span className="mt-1 block text-xs text-zinc-500">{field.description}</span>}{field.type === "rich_text" ? <Textarea required={field.required} value={String(values[field.databaseFieldId] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.databaseFieldId]: event.target.value }))} className="mt-2 min-h-28 border-zinc-800 bg-black" /> : field.type === "boolean" ? <input type="checkbox" checked={Boolean(values[field.databaseFieldId])} onChange={(event) => setValues((current) => ({ ...current, [field.databaseFieldId]: event.target.checked }))} className="ml-3 h-4 w-4" /> : <Input required={field.required} type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "datetime" ? "datetime-local" : field.type === "url" ? "url" : "text"} value={String(values[field.databaseFieldId] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.databaseFieldId]: event.target.value }))} className="mt-2 border-zinc-800 bg-black" />}</label>)}{submit.isError && <p role="alert" className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{submit.error.message}</p>}<Button type="submit" disabled={submit.isPending} className="w-full bg-white text-black hover:bg-zinc-200">{submit.isPending ? "Submitting…" : form.data.submitLabel}</Button></form></div></main>;
}
