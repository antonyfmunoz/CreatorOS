import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Send } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
type CaseRow = {
  id: string;
  caseNumber: string;
  orderId: string;
  category: string;
  summary: string;
  requestedRefundCents: number;
  approvedRefundCents: number;
  status: string;
  providerActionStatus: string;
};
type Operations = { cases: CaseRow[] };
type Detail = {
  supportCase: CaseRow;
  isSeller: boolean;
  messages: Array<{
    message: { id: string; body: string; createdAt: string };
    author: { displayName: string };
  }>;
};
export default function SupportCenterPage() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const [orderId, setOrderId] = useState(
    () => new URLSearchParams(location.search).get("orderId") ?? "",
  );
  const operations = useQuery<Operations>({
    queryKey: ["/api/marketplace/operations"],
  });
  const detail = useQuery<Detail>({
    queryKey: [`/api/marketplace/support-cases/${id}`],
    enabled: Boolean(id),
  });
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("access");
  const [refund, setRefund] = useState("0");
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState("");
  const action = useMutation({
    mutationFn: async ({
      method = "POST",
      path,
      body,
    }: {
      method?: "POST" | "PATCH";
      path: string;
      body: unknown;
    }) => (await apiRequest(method, path, body)).json(),
    onSuccess: async (value: { id?: string }) => {
      setMessage("Saved.");
      await queryClient.invalidateQueries({
        queryKey: ["/api/marketplace/operations"],
      });
      if (id) await detail.refetch();
      else if (value.id) navigate(`/support/${value.id}`);
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Action failed"),
  });
  const current = detail.data?.supportCase;
  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/orders")}
          >
            <ArrowLeft />
          </Button>
          <LifeBuoy className="text-[#1d9bf0]" />
          <div>
            <h1 className="font-black">Marketplace Support</h1>
            <p className="text-[10px] text-zinc-500">
              Accountable buyer–seller resolution with provider-confirmed
              refunds
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl p-4">
        {message && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-[#1d9bf0]/10 p-3 text-xs"
          >
            {message}
          </p>
        )}
        {id && current ? (
          <div className="grid gap-5 md:grid-cols-[300px_1fr]">
            <aside className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs font-black uppercase text-[#1d9bf0]">
                {current.caseNumber}
              </p>
              <h2 className="mt-2 font-black capitalize">
                {current.category} support
              </h2>
              <p className="mt-2 text-sm text-zinc-500">{current.summary}</p>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt>Status</dt>
                  <dd className="capitalize">
                    {current.status.replaceAll("_", " ")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Refund handoff</dt>
                  <dd>{current.providerActionStatus.replaceAll("_", " ")}</dd>
                </div>
              </dl>
              {detail.data?.isSeller && current.status !== "closed" && (
                <Button
                  className="mt-4 w-full"
                  variant="outline"
                  onClick={() =>
                    action.mutate({
                      method: "PATCH",
                      path: `/api/marketplace/support-cases/${id}`,
                      body: {
                        status: "resolved",
                        resolutionNote: "Resolved through participant support.",
                      },
                    })
                  }
                >
                  Resolve case
                </Button>
              )}
            </aside>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <h2 className="font-black">Conversation</h2>
              <div className="mt-4 space-y-3">
                {detail.data?.messages.map((row) => (
                  <article
                    key={row.message.id}
                    className="rounded-xl bg-black p-3"
                  >
                    <strong className="text-xs">
                      {row.author.displayName}
                    </strong>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
                      {row.message.body}
                    </p>
                    <time className="mt-2 block text-[10px] text-zinc-600">
                      {new Date(row.message.createdAt).toLocaleString()}
                    </time>
                  </article>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  className="border-zinc-800 bg-black"
                  placeholder="Reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <Button
                  size="icon"
                  disabled={!reply}
                  onClick={() => {
                    action.mutate({
                      path: `/api/marketplace/support-cases/${id}/messages`,
                      body: { body: reply },
                    });
                    setReply("");
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </section>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="font-black">Open a support case</h2>
              <Input
                className="mt-4 border-zinc-800 bg-black"
                placeholder="Paid order ID"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
              />
              <select
                className="mt-2 h-10 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="access">Access</option>
                <option value="billing">Billing</option>
                <option value="refund">Refund</option>
                <option value="content">Content</option>
                <option value="other">Other</option>
              </select>
              <textarea
                className="mt-2 min-h-28 w-full rounded-md border border-zinc-800 bg-black p-3 text-sm"
                placeholder="Describe what happened and the resolution you need"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              {category === "refund" && (
                <Input
                  className="mt-2 border-zinc-800 bg-black"
                  type="number"
                  step="0.01"
                  aria-label="Requested refund dollars"
                  value={refund}
                  onChange={(e) => setRefund(e.target.value)}
                />
              )}
              <Button
                className="mt-3 w-full"
                disabled={!orderId || summary.length < 10}
                onClick={() =>
                  action.mutate({
                    path: "/api/marketplace/support-cases",
                    body: {
                      orderId,
                      productId: null,
                      category,
                      summary,
                      requestedRefundCents: Math.round(Number(refund) * 100),
                    },
                  })
                }
              >
                Open case
              </Button>
            </section>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="font-black">Your cases</h2>
              {!operations.data?.cases.length && (
                <p className="mt-2 text-sm text-zinc-600">No cases yet.</p>
              )}
              {operations.data?.cases.map((supportCase) => (
                <button
                  key={supportCase.id}
                  className="mt-2 w-full rounded-xl bg-black p-3 text-left"
                  onClick={() => navigate(`/support/${supportCase.id}`)}
                >
                  <div className="flex justify-between">
                    <strong className="text-sm">
                      {supportCase.caseNumber}
                    </strong>
                    <span className="text-[10px] uppercase text-[#1d9bf0]">
                      {supportCase.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {supportCase.summary}
                  </p>
                </button>
              ))}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
