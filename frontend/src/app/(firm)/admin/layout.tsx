"use client";

import { ShieldOff } from "lucide-react";

import { EmptyState, LoadingBlock } from "@/components/ui";
import { useSession } from "@/lib/session";

/**
 * The one gate for the entire cross-tenant platform console.
 *
 * Before this file existed, every page under (firm)/admin/** had to
 * remember to check `error?.status === 403` on its own fetch and render an
 * EmptyState by hand — nine of them did, two (admin/support and
 * admin/support/[tenantId], both Server Components) didn't, and quietly fell
 * back to a plausible-looking empty inbox instead of an explicit denial for
 * a signed-in Firm Owner/staff account that ends up here (stale bookmark,
 * browser history, the impersonation-lost redirect landing nearby). The
 * sidebar link-hiding in components/firm/shell.tsx and the edge check in
 * proxy.ts both only ever handled the "don't show it as an option" half —
 * neither stops a direct URL visit from rendering the real page underneath.
 *
 * This is the missing route-level guard: nothing under /admin renders
 * unless `session.isSuperadmin` is actually true, re-evaluated on every
 * render off the live, polled session — so it also closes the "session sat
 * open for a while, impersonation quietly ended, but the admin console
 * kept showing" window, within one polling interval instead of never.
 * Backend SuperadminDep on every /admin/* route remains the real
 * authorization boundary; this only controls what renders in the browser.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = useSession();

  if (session.isLoading) {
    return (
      <div className="mx-auto max-w-7xl">
        <LoadingBlock rows={6} />
      </div>
    );
  }

  if (!session.isSuperadmin) {
    return (
      <EmptyState
        icon={<ShieldOff className="size-6" />}
        title="Superadmin access required"
        description="The platform admin console is restricted to the SpidNums platform superadmin role."
      />
    );
  }

  return <>{children}</>;
}
