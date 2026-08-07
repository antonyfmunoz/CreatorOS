import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Search, Trash2, UserRoundPlus, Users } from "lucide-react";
import { Contact } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ContactListProps {
  userId: number;
}

type ContactDraft = { name: string; note: string };

const emptyDraft: ContactDraft = { name: "", note: "" };

const ContactList = ({ userId }: ContactListProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const queryKey = ["/api/users", userId, "contacts"] as const;

  const contactsQuery = useQuery<Contact[]>({
    queryKey,
    enabled: userId > 0,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/users/${userId}/contacts`);
      return response.json();
    },
  });

  const saveContact = useMutation({
    mutationFn: async () => {
      const payload = { contactName: draft.name.trim(), purchaseInfo: draft.note.trim() || null };
      const response = editingId
        ? await apiRequest("PATCH", `/api/contacts/${editingId}`, payload)
        : await apiRequest("POST", "/api/contacts", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDraft(emptyDraft);
      setEditingId(null);
      setEditorOpen(false);
      toast({ title: editingId ? "Contact updated" : "Contact added" });
    },
    onError: (error: Error) => toast({ title: "Contact was not saved", description: error.message, variant: "destructive" }),
  });

  const deleteContact = useMutation({
    mutationFn: async (contact: Contact) => {
      if (!window.confirm(`Delete ${contact.contactName} from your contacts?`)) return false;
      await apiRequest("DELETE", `/api/contacts/${contact.id}`);
      return true;
    },
    onSuccess: (deleted) => {
      if (!deleted) return;
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Contact deleted" });
    },
    onError: (error: Error) => toast({ title: "Contact was not deleted", description: error.message, variant: "destructive" }),
  });

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contactsQuery.data ?? [];
    return (contactsQuery.data ?? []).filter((contact) =>
      `${contact.contactName} ${contact.purchaseInfo ?? ""}`.toLowerCase().includes(term),
    );
  }, [contactsQuery.data, search]);

  const startCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setEditorOpen(true);
  };

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id);
    setDraft({ name: contact.contactName, note: contact.purchaseInfo ?? "" });
    setEditorOpen(true);
  };

  if (contactsQuery.isLoading) {
    return <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 rounded-2xl bg-zinc-900" />)}</div>;
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Relationship workspace</h2>
          <p className="mt-1 text-sm text-zinc-500">Keep collaborators, customers, and commercial context close.</p>
        </div>
        <Button size="sm" className="rounded-xl bg-white text-black hover:bg-zinc-200" onClick={startCreate}>
          <UserRoundPlus className="mr-2 h-4 w-4" /> New
        </Button>
      </div>

      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
        <Input aria-label="Search contacts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people or notes" className="border-zinc-800 bg-zinc-950 pl-9 text-white placeholder:text-zinc-600" />
      </label>

      {editorOpen && (
        <form
          className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
          onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) saveContact.mutate(); }}
        >
          <p className="text-sm font-bold text-white">{editingId ? "Edit contact" : "Add a contact"}</p>
          <Input aria-label="Contact name" placeholder="Name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="border-zinc-700 bg-black text-white placeholder:text-zinc-600" />
          <Input aria-label="Contact note" placeholder="Relationship, purchase, or follow-up note" value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} className="border-zinc-700 bg-black text-white placeholder:text-zinc-600" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button type="submit" className="bg-white text-black hover:bg-zinc-200" disabled={!draft.name.trim() || saveContact.isPending}>{saveContact.isPending ? "Saving…" : "Save contact"}</Button>
          </div>
        </form>
      )}

      {contactsQuery.isError && <p className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">Contacts could not be loaded. Refresh to try again.</p>}

      <div className="mt-4 space-y-2">
        {filteredContacts.map((contact) => (
          <article key={contact.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
            <Avatar className="h-11 w-11 border border-zinc-800">
              <AvatarImage src={contact.contactImage ?? undefined} alt={contact.contactName} />
              <AvatarFallback className="bg-zinc-900 font-bold text-white">{contact.contactName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{contact.contactName}</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">{contact.purchaseInfo || "No relationship note yet"}</p>
            </div>
            <Button size="icon" variant="ghost" aria-label={`Edit ${contact.contactName}`} className="text-zinc-500 hover:bg-zinc-900 hover:text-white" onClick={() => startEdit(contact)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={`Delete ${contact.contactName}`} className="text-zinc-500 hover:bg-red-950 hover:text-red-300" disabled={deleteContact.isPending} onClick={() => deleteContact.mutate(contact)}><Trash2 className="h-4 w-4" /></Button>
          </article>
        ))}
      </div>

      {!contactsQuery.isError && filteredContacts.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 px-6 py-10 text-center">
          <Users className="mx-auto h-7 w-7 text-zinc-700" />
          <p className="mt-3 text-sm font-semibold text-zinc-300">{search ? "No matching contacts" : "No contacts yet"}</p>
          <p className="mt-1 text-xs text-zinc-600">{search ? "Try a different name or note." : "Add someone you want to keep in your creative orbit."}</p>
        </div>
      )}
    </section>
  );
};

export default ContactList;
