import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui";

import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    // useSearchParams (for ?mode=) needs a Suspense boundary so the shell can still prerender.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ImportClient />
    </Suspense>
  );
}
