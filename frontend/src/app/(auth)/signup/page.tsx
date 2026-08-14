import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Start your free SpeedNum trial — no credit card required.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    // The form reads `?invite=` via useSearchParams, which needs a Suspense
    // boundary so the shell can still prerender.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SignupForm />
    </Suspense>
  );
}
