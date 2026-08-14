import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui";

import { PortalLoginClient } from "./portal-login-client";

export const metadata: Metadata = {
  title: "Signing you in",
  robots: { index: false, follow: false },
};

export default function PortalLoginPage() {
  return (
    <main id="main" className="flex min-h-screen flex-1 items-center justify-center bg-canvas px-5 py-12">
      {/* useSearchParams needs a Suspense boundary so the shell can still prerender. */}
      <Suspense fallback={<Skeleton className="h-48 w-full max-w-sm" />}>
        <PortalLoginClient />
      </Suspense>
    </main>
  );
}
