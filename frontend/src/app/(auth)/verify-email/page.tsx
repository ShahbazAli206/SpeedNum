import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui";

import { VerifyEmailClient } from "./verify-email-client";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Confirm your SpidNums account email address.",
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <VerifyEmailClient />
    </Suspense>
  );
}
