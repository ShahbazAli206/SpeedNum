"use client";

import {
  Activity,
  Ban,
  Building2,
  CheckCircle2,
  Eye,
  Gauge,
  Globe,
  RefreshCw,
  Search,
  Server,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";

import { KpiTile } from "@/components/charts";
import { KpiRow } from "@/components/dashboard/page-shell";
import { Badge, Button, Card, EmptyState, LoadingBlock } from "@/components/ui";
import type { Tone } from "@/components/ui";
import type { ReachData } from "@/lib/admin";
import { useApi } from "@/lib/hooks";
import { searchFootprint } from "@/lib/seo";

const VITALS = [
  { key: "LCP", name: "Largest Contentful Paint", hint: "Loading — good at 2.5s or under" },
  { key: "INP", name: "Interaction to Next Paint", hint: "Responsiveness — good at 200ms or under" },
  { key: "CLS", name: "Cumulative Layout Shift", hint: "Visual stability — good at 0.1 or under" },
  { key: "FCP", name: "First Contentful Paint", hint: "First paint — good at 1.8s or under" },
  { key: "TTFB", name: "Time to First Byte", hint: "Server response — good at 800ms or under" },
];

const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());

export function ReachClient() {
  const reach = useApi<ReachData>("/admin/reach");
  const footprint = useMemo(() => searchFootprint(), []);

  if (reach.error?.status === 403) {
    return (
      <EmptyState
        icon={<Ban className="size-6" />}
        title="Superadmin access required"
        description="The Reach page is restricted to the platform superadmin role."
      />
    );
  }
  if (reach.error) {
    return (
      <EmptyState
        icon={<TriangleAlert className="size-6" />}
        title="Couldn't load Reach"
        description={
          reach.error.status === 404
            ? "The platform reach endpoint isn't available on the API yet — deploy the latest backend, then retry."
            : "Something went wrong reaching the API. Please try again."
        }
        action={
          <Button variant="secondary" onClick={() => reach.reload()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (reach.isLoading || !reach.data) {
    return <LoadingBlock label="Loading reach…" />;
  }

  // The API still returns this block under a legacy key; locally it's just
  // "does our own analytics service have live traffic to show".
  const { vercel: analytics, traffic, scale } = reach.data;
  const analyticsLive = analytics.web_analytics_configured;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          onClick={() => reach.reload()}
        >
          Refresh
        </Button>
      </div>

      <KpiRow>
        <KpiTile
          tone="blue"
          value={num(traffic?.visitors)}
          label={`Visitors (${traffic?.period_days ?? 28}d)`}
          icon={<Globe className="size-5" />}
        />
        <KpiTile
          tone="violet"
          value={num(traffic?.pageviews)}
          label={`Pageviews (${traffic?.period_days ?? 28}d)`}
          icon={<Eye className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(footprint.total)}
          label="Indexable pages"
          icon={<Globe className="size-5" />}
        />
        <KpiTile
          tone="amber"
          value={String(scale.tenants)}
          label="Firms on platform"
          icon={<Building2 className="size-5" />}
        />
        <KpiTile
          tone="green"
          value={String(scale.clients)}
          label="Clients (all firms)"
          icon={<Users className="size-5" />}
        />
        <KpiTile
          tone="rose"
          value={String(scale.users)}
          label="Users (all firms)"
          icon={<Users className="size-5" />}
        />
      </KpiRow>

      {/* Infrastructure & SEO — self-hosted stack, no third-party platform in the path */}
      <Card className="mt-6 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            {analyticsLive ? <CheckCircle2 className="size-4.5" /> : <Server className="size-4.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-ink">Infrastructure &amp; SEO</h2>
              <Badge tone={analyticsLive ? "success" : "warn"}>
                {analyticsLive ? "Analytics live" : "Analytics pending"}
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              Where the platform runs and how search finds it — our own servers, our own SEO, with no
              third-party platform in the path.
            </p>
          </div>
        </div>

        <div className="mt-4 divide-y divide-line rounded-lg border border-line">
          <InfraRow
            icon={<Server className="size-4" />}
            name="Hosting"
            detail="Self-hosted on our own VPS — the app and API run entirely on infrastructure we control."
            status="Live"
            tone="success"
          />
          <InfraRow
            icon={<Search className="size-4" />}
            name="Search & SEO"
            detail="Custom setup — every indexable page is generated straight from the sitemap, so search sees exactly what we publish."
            status={`${footprint.total} pages`}
            tone="brand"
          />
          <InfraRow
            icon={<Activity className="size-4" />}
            name="Traffic analytics"
            detail={
              analyticsLive
                ? "Connected — live visitor and pageview numbers are read into the tiles above."
                : "Point the API server at our analytics service to light up the visitor and pageview tiles above."
            }
            status={analyticsLive ? "Connected" : "Not connected"}
            tone={analyticsLive ? "success" : "neutral"}
          />
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Analytics credentials stay on the API server only — never expose them with a{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_</code>{" "}
          prefix, or the key would ship to every visitor&apos;s browser.
        </p>
      </Card>

      {/* Core Web Vitals */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <Gauge className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Core Web Vitals</h2>
              <p className="mt-0.5 text-[13px] text-muted">
                Performance targets — the &ldquo;good&rdquo; threshold each metric should stay under
              </p>
            </div>
          </div>
          <Badge tone="info">Targets</Badge>
        </div>
        <ul className="divide-y divide-line">
          {VITALS.map((v) => (
            <li key={v.key} className="flex items-center gap-3 px-5 py-3">
              <span className="w-12 shrink-0 font-mono text-[12px] font-semibold text-brand">{v.key}</span>
              <span className="min-w-0 flex-1">
                <span className="text-[13.5px] font-medium text-ink">{v.name}</span>
                <span className="ml-2 text-[12.5px] text-muted">{v.hint}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-4 text-[12px] text-muted">
          These are Google&apos;s Core Web Vitals thresholds — the bar real visits should clear. Wire
          field-data collection on the VPS to track how the live site measures up against them.
        </p>
      </Card>

      {/* Search footprint */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Search footprint</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Every public page our custom SEO setup publishes, by tier
            </p>
          </div>
          <Badge tone="brand">{footprint.total} in sitemap</Badge>
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] tracking-wide text-muted uppercase">
                <th className="px-5 py-2.5 text-left font-semibold">Tier</th>
                <th className="px-5 py-2.5 text-right font-semibold">Pages</th>
                <th className="px-5 py-2.5 text-right font-semibold">In sitemap</th>
              </tr>
            </thead>
            <tbody>
              {footprint.tiers.map((t) => (
                <tr key={t.tier} className="border-b border-line">
                  <td className="px-5 py-2.5 text-ink-soft">{t.tier}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-ink-soft">{t.pages}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-brand">{t.pages}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-5 py-2.5 text-ink">Total</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-ink">{footprint.total}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-ink">{footprint.total}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[12px] text-muted">
          Read from the same source of truth as{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">sitemap.xml</code>, so
          the footprint can never claim a page the sitemap doesn&apos;t publish.
        </p>
      </Card>

      {/* Platform scale */}
      <Card className="mt-6 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Platform scale</h2>
        <p className="mt-0.5 text-[13px] text-muted">Live totals across every tenant</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <ScaleStat label="Firms" value={scale.tenants} />
          <ScaleStat label="Active firms" value={scale.active_tenants} />
          <ScaleStat label="Clients" value={scale.clients} />
          <ScaleStat label="Users" value={scale.users} />
          <ScaleStat label="Engagements" value={scale.engagements} />
        </div>
      </Card>
    </>
  );
}

function InfraRow({
  icon,
  name,
  detail,
  status,
  tone,
}: {
  icon: ReactNode;
  name: string;
  detail: string;
  status: string;
  tone: Tone;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{name}</span>
          <Badge tone={tone}>{status}</Badge>
        </div>
        <p className="mt-0.5 text-[12px] text-muted">{detail}</p>
      </div>
    </div>
  );
}

function ScaleStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[12px] font-medium tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value.toLocaleString()}</p>
    </div>
  );
}
