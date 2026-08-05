import { ShieldCheck } from "lucide-react";

import { Logo } from "@/components/logo";
import { SITE } from "@/lib/site";

import { AuthAside } from "./auth-aside";

/**
 * Split-screen auth shell. The left panel is the pitch and the right panel
 * holds the form; on small screens the panel collapses to a compact header so
 * the form stays above the fold.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="flex min-h-screen flex-1 flex-col lg:flex-row">
      <aside className="navy-band relative isolate flex flex-col overflow-hidden px-6 py-10 lg:w-[52%] lg:px-14 lg:py-12">
        <div className="grid-lines-dark pointer-events-none absolute inset-0 opacity-50" aria-hidden />

        <div className="relative">
          <Logo size={34} tone="invert" />
        </div>

        <AuthAside />

        <p className="relative mt-8 hidden items-center gap-2 text-[13px] text-white/45 lg:flex">
          <ShieldCheck className="size-3.5" />
          Bank-grade security · CRA-compliant · © {SITE.founded} {SITE.name}
        </p>
      </aside>

      <div className="flex flex-1 items-center justify-center bg-surface px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
