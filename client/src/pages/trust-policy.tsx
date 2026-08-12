import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Section = { title: string; paragraphs: string[]; bullets?: string[] };
type Policy = { title: string; summary: string; sections: Section[] };

const policies: Record<string, Policy> = {
  "/legal/data-deletion": {
    title: "Account data deletion",
    summary: "The operational policy implemented by the CreativesOS account-erasure workflow.",
    sections: [
      { title: "Before deletion", paragraphs: ["A signed-in account owner can download a machine-readable export and schedule deletion from Data & Privacy. The request has a seven-day grace period and can be canceled before processing begins."] },
      { title: "Ownership protection", paragraphs: ["Deletion is blocked when the account still owns a business or community with other active members. Ownership must be transferred first so one person's deletion cannot erase another person's workspace."] },
      { title: "What is erased", paragraphs: ["CreativesOS removes personal profile fields, authored social content, private assets, drafts, personal documents and contacts, saved items, provider tokens, private AI content, and sole-owner workspaces. Authored messages inside shared conversations are replaced with a deletion marker so the remaining conversation does not become structurally corrupt."] },
      { title: "What can remain", paragraphs: ["Financial, entitlement, fraud-prevention, safety, audit, and integrity records may remain where deletion would break another person's rights or the platform's legal and security obligations. The account identity attached to those records is pseudonymized."] },
      { title: "External identity", paragraphs: ["After local erasure succeeds, CreativesOS deletes the matching Clerk authentication identity. A failed identity-provider deletion remains queued for retry while the local account stays inaccessible."] },
    ],
  },
  "/legal/community-guidelines": {
    title: "Community guidelines",
    summary: "Rules for participating in CreativesOS social, messaging, marketplace, and community spaces.",
    sections: [
      { title: "Respect people and consent", paragraphs: ["Do not threaten, harass, stalk, exploit, or impersonate another person. Do not record, transcribe, analyze, or clone a person's voice without the permissions and disclosures required by the product."] },
      { title: "Keep access legitimate", paragraphs: ["Do not bypass membership, payment, entitlement, privacy, moderation, or rate-limit controls. Do not request passwords, authentication codes, private keys, or other credentials through posts, messages, automations, or AI agents."] },
      { title: "Publish responsibly", paragraphs: ["Only publish content and sell products you have the right to distribute. Synthetic media must not be used deceptively. Spam, coordinated manipulation, scams, and concealed automated outreach are prohibited."] },
      { title: "Enforcement", paragraphs: ["Members can report content. Authorized moderators can review, dismiss, restrict, or remove content and memberships within their scope. Material decisions retain an accountable audit trail."] },
    ],
  },
  "/legal/ai-recording": {
    title: "AI, recording, and synthetic media policy",
    summary: "Product rules governing AI assistance, guest intelligence, transcription, and cloned voice.",
    sections: [
      { title: "Observable evidence", paragraphs: ["AI may summarize statements and observable interaction evidence. It must not present hidden-trait, protected-trait, clinical, or psychological speculation as fact. Reviewable evidence remains attached to material suggestions."] },
      { title: "Human authority", paragraphs: ["Role policies define what an AI may observe, suggest, or do. Irreversible, public, financial, consent, credential, legal, medical, emergency, political-persuasion, and identity-sensitive actions remain blocked or require explicit human approval."] },
      { title: "Meeting consent", paragraphs: ["Recording, transcription, and AI participation are separate capabilities. Each requires the room policy, host authority, active participant consent, capacity, and retention controls. Consent loss must stop the applicable live capability."] },
      { title: "Synthetic voice", paragraphs: ["A voice profile requires owner attestation and revocable consent. AI-written scripts require exact-script approval. Generated voice messages must carry synthetic-media provenance and disclosure and may not be used for impersonation or deceptive authority."] },
    ],
  },
};

export default function TrustPolicy() {
  const [location, setLocation] = useLocation();
  const policy = policies[location] ?? policies["/legal/data-deletion"];
  return <main className="min-h-dvh bg-black text-white"><header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-800 bg-black px-4"><Button variant="ghost" size="icon" className="-ml-2 text-zinc-300 hover:bg-zinc-900 hover:text-white" onClick={() => history.length > 1 ? history.back() : setLocation("/trust")} aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button><h1 className="text-lg font-bold">{policy.title}</h1></header><article className="mx-auto max-w-3xl px-5 py-9"><p className="text-base leading-7 text-zinc-300">{policy.summary}</p><p className="mt-3 text-xs text-zinc-400">Operational policy version 1.0 · Updated August 10, 2026</p><div className="mt-8 space-y-8">{policy.sections.map((section) => <section key={section.title}><h2 className="text-lg font-bold">{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-7 text-zinc-300">{paragraph}</p>)}</section>)}</div><button onClick={() => setLocation("/trust")} className="mt-10 text-sm font-bold text-[#1d9bf0] hover:underline">Return to the Trust Center</button></article></main>;
}
