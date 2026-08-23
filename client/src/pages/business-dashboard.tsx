import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ContactRound,
  Megaphone,
  PackagePlus,
  Palette,
  Globe2,
  Send,
  Radio,
  ShieldCheck,
  Users,
  Handshake,
  Link2,
  CalendarClock,
  Store,
  Scale,
  Braces,
  Activity,
  DatabaseBackup,
  PlugZap,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

type UmhOperations = { pendingApprovalCount: number };
type BusinessOffer = {
  id: number;
  title: string;
  category: string;
  price: number;
  status: "draft" | "published" | "archived";
};
type BusinessInsights = {
  creatorEarningsCents: number;
  pendingCreatorEarningsCents: number;
  platformFeesCents: number;
  creatorSales: number;
  offers: number;
  recentOffers: BusinessOffer[];
  followers: number;
  following: number;
  campaigns: number;
  distribution: {
    published: number;
    scheduled: number;
    needsConnection: number;
  };
};

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </article>
  );
}
export default function BusinessDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: insights, isLoading: loadingInsights } =
    useQuery<BusinessInsights>({
      queryKey: ["/api/business/insights"],
      enabled: !!user,
      queryFn: async () => {
        const response = await fetch("/api/business/insights");
        if (!response.ok) throw new Error("Unable to load business insights");
        return response.json();
      },
    });
  const { data: umhOperations } = useQuery<UmhOperations>({
    queryKey: ["/api/umh/operations"],
    enabled: !!user,
    queryFn: async () => {
      const response = await fetch("/api/umh/operations");
      if (!response.ok) throw new Error("Unable to load operating approvals");
      return response.json();
    },
  });
  const ownProducts = insights?.recentOffers ?? [];
  const revenueTotal = (insights?.creatorEarningsCents ?? 0) / 100;
  const publishedJobs = insights?.distribution.published ?? 0;
  const scheduledJobs = insights?.distribution.scheduled ?? 0;
  const waitingForConnection = insights?.distribution.needsConnection ?? 0;
  const followers = insights?.followers ?? 0;
  const following = insights?.following ?? 0;
  const distributionDetail =
    waitingForConnection > 0
      ? `${scheduledJobs} queued · ${waitingForConnection} awaiting connection`
      : `${scheduledJobs} queued`;
  const actions = [
    {
      title: "Provider Activation",
      description:
        "Qualify every external capability with current, append-only field-test evidence before treating it as production-ready.",
      icon: PlugZap,
      href: "/business/providers",
    },
    {
      title: "Data Portability",
      description:
        "Export canonical operating data or run validated, atomic, idempotent migrations from other platforms.",
      icon: DatabaseBackup,
      href: "/business/portability",
    },
    {
      title: "Operations Control Plane",
      description:
        "Track published SLOs, error budgets, usage evidence, and per-tenant cost boundaries without hiding unmeasured services.",
      icon: Activity,
      href: "/business/operations",
    },
    {
      title: "Developer Platform",
      description:
        "Connect approved systems through scoped API keys, signed webhooks, retries, and auditable delivery evidence.",
      icon: Braces,
      href: "/business/developer",
    },
    {
      title: "Competitive Benchmarks",
      description:
        "Lock equal-input tests, capture operator evidence, and prove parity or connected advantage without inflating claims.",
      icon: Scale,
      href: "/business/benchmarks",
    },
    {
      title: "Marketplace Operations",
      description:
        "Run your storefront, bundles, promotions, buyer support, and provider-confirmed refund handoffs.",
      icon: Store,
      href: "/business/marketplace",
    },
    {
      title: "Booking & Event Operations",
      description:
        "Sell appointments and tickets with availability, waitlists, rooms, attendance, reminders, and replay access.",
      icon: CalendarClock,
      href: "/business/booking",
    },
    {
      title: "Sponsorship Studio",
      description:
        "Close brand partnerships from proof and pricing through delivery, invoicing, and renewal.",
      icon: Handshake,
      href: "/business/sponsorship",
    },
    {
      title: "Affiliate & Referral Studio",
      description:
        "Run partner and customer-led growth with governed attribution, commissions, and rewards.",
      icon: Link2,
      href: "/business/affiliates",
    },
    {
      title: "Audience Studio",
      description:
        "Capture subscribers, publish newsletters, and nurture owned relationships.",
      icon: Users,
      href: "/business/audience",
    },
    {
      title: "Podcast Studio",
      description:
        "Host audio and video shows, publish RSS, and grow member listening.",
      icon: Radio,
      href: "/business/podcasts",
    },
    {
      title: "DesignStudio",
      description:
        "Create brand-consistent graphics and hand them directly to distribution.",
      icon: Palette,
      href: "/business/design",
    },
    {
      title: "Creator Site & Link Hub",
      description:
        "Own the destination, subscriber capture, offers, and conversion path.",
      icon: Globe2,
      href: "/business/site",
    },
    {
      title: "Production planner",
      description:
        "Coordinate ideas, production, review, schedules, and retrospectives.",
      icon: CalendarDays,
      href: "/business/planner",
    },
    {
      title: "Creator intelligence",
      description: "Trace content through attention, conversion, and revenue.",
      icon: BarChart3,
      href: "/business/analytics",
    },
    {
      title: "Publish content",
      description: "Create, schedule, and manage distribution.",
      icon: Send,
      href: "/studio",
    },
    {
      title: "Create an offer",
      description: "Launch a course, community, or digital asset.",
      icon: PackagePlus,
      href: "/create-product",
    },
    {
      title: "Manage relationships",
      description: "See your contacts and customer context.",
      icon: ContactRound,
      href: "/contacts",
    },
    {
      title: "Run a campaign",
      description: "Plan a launch, creator seeding, or growth sprint.",
      icon: Megaphone,
      href: "/campaigns",
    },
    {
      title: "Creator earnings",
      description:
        "Connect payouts and separate creator earnings from platform revenue.",
      icon: CircleDollarSign,
      href: "/earnings",
    },
    {
      title: "Orders and sales",
      description: "See customer purchases and the offers you sold.",
      icon: CircleDollarSign,
      href: "/orders",
    },
    {
      title: "Operating approvals",
      description: umhOperations?.pendingApprovalCount
        ? `${umhOperations.pendingApprovalCount} action${umhOperations.pendingApprovalCount === 1 ? "" : "s"} waiting for you.`
        : "Review sensitive actions before they run.",
      icon: ShieldCheck,
      href: "/business/approvals",
    },
  ];
  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
          Creator business
        </p>
        <div className="mt-1 flex items-center justify-between gap-4">
          <h1 className="truncate text-2xl font-bold">Business dashboard</h1>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white"
            onClick={() => setLocation("/earnings")}
            aria-label="Open creator earnings"
          >
            <BarChart3 className="h-5 w-5" />
          </Button>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-3 p-4">
        {loadingInsights ? (
          <>
            <Skeleton className="h-28 bg-zinc-900" />
            <Skeleton className="h-28 bg-zinc-900" />
          </>
        ) : (
          <>
            <Metric
              label="Revenue"
              value={`$${revenueTotal.toFixed(0)}`}
              detail="All-time verified creator earnings"
            />
            <Metric
              label="Offers"
              value={String(insights?.offers ?? 0)}
              detail="Offers in your workspace"
            />
            <Metric
              label="Followers"
              value={String(followers)}
              detail={`${following} following`}
            />
            <Metric
              label="Distribution"
              value={`${publishedJobs} live`}
              detail={distributionDetail}
            />
          </>
        )}
      </section>
      <section className="px-4 pt-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold">Your operating loop</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Publish content, run campaigns, convert attention into offers,
                then measure what works.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              className="h-10 rounded-xl bg-white text-sm font-bold text-black hover:bg-zinc-200"
              onClick={() => setLocation("/studio")}
            >
              Distribution plan
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-xl border-zinc-700 bg-black text-sm font-bold text-white hover:bg-zinc-900 hover:text-white"
              onClick={() => setLocation("/campaigns")}
            >
              Run campaign
            </Button>
          </div>
        </div>
      </section>
      <section className="px-4 pt-7">
        <h2 className="text-base font-bold">Run your business</h2>
        <div className="mt-3 space-y-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:bg-zinc-900"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">
                    {action.title}
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    {action.description}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </Link>
            );
          })}
        </div>
      </section>
      <section className="px-4 pt-7">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Your offers</h2>
          <button
            onClick={() => setLocation("/create-product")}
            className="text-xs font-bold text-zinc-300"
          >
            New offer
          </button>
        </div>
        {ownProducts.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-zinc-800 p-6 text-center">
            <CircleDollarSign className="mx-auto h-6 w-6 text-zinc-600" />
            <p className="mt-3 text-sm font-semibold">
              Launch your first offer
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Products become the commerce layer of your creator business.
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {ownProducts.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.id}/edit`}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 transition-colors hover:bg-zinc-900"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800">
                  <PackagePlus className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {product.title}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {product.category}{" "}
                    <span className="uppercase">· {product.status}</span>
                  </span>
                </span>
                <span className="text-sm font-bold">
                  ${product.price.toFixed(0)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="px-4 pt-7">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold">Audience intelligence</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Campaign snapshots now preserve reach, conversion, spend, and
                return. Connected platform attribution follows with providers.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
