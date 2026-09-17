import { SignIn, SignUp } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";

const clerkAppearance = {
  variables: {
    colorPrimary: "#1d9bf0", colorBackground: "#09090b", colorInputBackground: "#18181b", colorInputText: "#fafafa", colorText: "#fafafa", colorTextSecondary: "#a1a1aa", colorNeutral: "#27272a", borderRadius: "14px",
  },
  elements: {
    rootBox: "!w-full !max-w-none", cardBox: "!w-full !shadow-none", card: "!w-full !max-w-none !border-0 !bg-transparent !p-0 !shadow-none",
    header: "!mb-7 !text-left", headerTitle: "!text-2xl !font-bold !tracking-tight !text-white", headerSubtitle: "!mt-2 !text-sm !text-zinc-400",
    socialButtonsBlockButton: "!h-11 !border-zinc-800 !bg-zinc-900 !text-white hover:!bg-zinc-800", socialButtonsBlockButtonText: "!font-semibold",
    dividerLine: "!bg-zinc-800", dividerText: "!text-zinc-500", formFieldLabel: "!text-sm !font-medium !text-zinc-200",
    formFieldInput: "!h-11 !border-zinc-800 !bg-zinc-900 !text-white placeholder:!text-zinc-500 focus:!border-[#1d9bf0]",
    formButtonPrimary: "!h-11 !bg-[#1d9bf0] !font-bold !text-black !shadow-none hover:!bg-sky-400",
    footer: "!mt-7 !border-t !border-zinc-800 !pt-5", footerActionText: "!text-zinc-400", footerActionLink: "!font-semibold !text-[#38bdf8] hover:!text-sky-300",
    identityPreviewText: "!text-zinc-400", identityPreviewEditButton: "!text-[#38bdf8]", alertText: "!text-zinc-300",
  },
} as const;

const AuthPage = () => {
  const [location, setLocation] = useLocation();
  const { isSignedIn } = useAuth();
  const isRegistration = location === "/auth/register";
  if (isSignedIn) return <Redirect to="/" />;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#050505] text-white">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(29,155,240,0.18),transparent_29%),radial-gradient(circle_at_82%_82%,rgba(37,99,235,0.12),transparent_32%)]" />
      <div className="relative mx-auto grid min-h-[100dvh] max-w-[1440px] lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)]">
        <section className="flex min-h-[44dvh] flex-col justify-between border-b border-white/10 px-6 py-7 sm:px-10 sm:py-10 lg:min-h-0 lg:border-b-0 lg:border-r lg:px-14 lg:py-12 xl:px-20">
          <div>
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1d9bf0] text-lg font-black tracking-tighter text-black shadow-[0_0_34px_rgba(29,155,240,0.38)]">C</span><span className="text-lg font-bold tracking-tight">CreativesOS</span></div>
            <div className="mt-14 max-w-xl sm:mt-20 lg:mt-[18vh]"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#38bdf8]">The creator distribution system</p><h1 className="mt-5 text-4xl font-bold tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">Make the work.<br />Move the world.</h1><p className="mt-6 max-w-md text-base leading-7 text-zinc-400 sm:text-lg">One focused workspace for creating, publishing, building community, and turning attention into a durable business.</p></div>
          </div>
          <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3 lg:mt-0">
            {[["Create", "Studio-grade tools"], ["Distribute", "Every channel"], ["Grow", "Your audience"]].map(([title, detail], index) => <div key={title} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 backdrop-blur-sm"><span className="text-xs font-bold text-[#38bdf8]">0{index + 1}</span><p className="mt-2 text-sm font-semibold text-white">{title}</p><p className="mt-0.5 text-xs text-zinc-500">{detail}</p></div>)}
          </div>
        </section>
        <section className="flex min-h-[56dvh] items-center px-5 py-10 sm:px-10 lg:min-h-0 lg:px-16 xl:px-24"><div className="mx-auto w-full max-w-[420px]"><div className="rounded-[24px] border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">CreativesOS account</p>{isRegistration ? <SignUp routing="hash" appearance={clerkAppearance} signInUrl="/auth/login" /> : <SignIn routing="hash" appearance={clerkAppearance} signUpUrl="/auth/register" />}</div><nav aria-label="Trust and safety" className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-zinc-500"><button onClick={() => setLocation("/trust")} className="transition-colors hover:text-white">Trust center</button><button onClick={() => setLocation("/legal/community-guidelines")} className="transition-colors hover:text-white">Community rules</button><button onClick={() => setLocation("/legal/ai-recording")} className="transition-colors hover:text-white">AI &amp; recording</button><button onClick={() => setLocation("/legal/data-deletion")} className="transition-colors hover:text-white">Data deletion</button></nav></div></section>
      </div>
    </main>
  );
};

export default AuthPage;
