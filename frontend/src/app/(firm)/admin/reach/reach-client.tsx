"use client";

import {
  Activity,
  Ban,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  Globe,
  KeyRound,
  Users,
} from "lucide-react";
import { useMemo } from "react";

import { KpiTile } from "@/components/charts";
import { KpiRow } from "@/components/dashboard/page-shell";
import { Badge, Card, EmptyState, LoadingBlock } from "@/components/ui";
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
  if (reach.isLoading || !reach.data) {
    return <LoadingBlock label="Loading reach…" />;
  }

  const { vercel, traffic, scale } = reach.data;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <a
          href="https://vercel.com/dashboard/analytics"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand transition hover:underline"
        >
          Open Vercel dashboard
          <ExternalLink className="size-3.5" />
        </a>
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

      {/* Vercel Web Analytics connection */}
      <Card className="mt-6 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            {vercel.web_analytics_configured ? (
              <CheckCircle2 className="size-4.5" />
            ) : (
              <Activity className="size-4.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-ink">Vercel Web Analytics</h2>
              <Badge tone={vercel.web_analytics_configured ? "success" : "warn"}>
                {vercel.web_analytics_configured ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">
              {vercel.web_analytics_configured
                ? "Live visitor and pageview numbers are read from the Web Analytics API above."
                : "Add the server-only environment variables below on the API, then redeploy, to show live numbers."}
            </p>
          </div>
        </div>

        <div className="mt-4 divide-y divide-line rounded-lg border border-line">
          <EnvRow
            name="VERCEL_API_TOKEN"
            set={vercel.api_token_set}
            optional={false}
            hint="Server-only token for the Web Analytics query API. Vercel → Account Settings → Tokens."
          />
          <EnvRow
            name="VERCEL_PROJECT_ID"
            set={vercel.project_id_set}
            optional={false}
            hint="Which project's analytics to read. Vercel → Project → Settings → General (starts with prj_)."
          />
          <EnvRow
            name="VERCEL_TEAM_ID"
            set={vercel.team_id_set}
            optional
            hint="Only for team-owned projects. Vercel → Team Settings → General (starts with team_)."
          />
        </div>
        <p className="mt-3 text-[12px] text-muted">
          These are server-only variables — set them on the API service, never with a{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_</code>{" "}
          prefix, or the token would ship to every visitor&apos;s browser.
        </p>
      </Card>

      {/* Core Web Vitals */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Core Web Vitals</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Real-user performance, collected by Vercel Speed Insights
            </p>
          </div>
          <Badge tone="info">Collecting</Badge>
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
        <div className="border-t border-line px-5 py-3 text-right">
          <a
            href="https://vercel.com/dashboard/speed-insights"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
          >
            View in Vercel
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        <p className="px-5 pb-4 text-[12px] text-muted">
          Speed Insights has no public read API — Vercel exposes these percentiles in its dashboard,
          so this page links to the source of truth rather than estimating them.
        </p>
      </Card>

      {/* Search footprint */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Search footprint</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              Every public page the marketing site generates, by tier
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

function EnvRow({
  name,
  set,
  optional,
  hint,
}: {
  name: string;
  set: boolean;
  optional: boolean;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-muted">
        <KeyRound className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="font-mono text-[12.5px] font-semibold text-ink">{name}</code>
          <Badge tone={set ? "success" : optional ? "neutral" : "danger"}>
            {set ? "Set" : optional ? "Optional" : "Missing"}
          </Badge>
        </div>
        <p className="mt-0.5 text-[12px] text-muted">{hint}</p>
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
