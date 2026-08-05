import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to your SpeedNum client portal.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    // useSearchParams needs a Suspense boundary so the shell can still prerender.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <LoginForm />
    </Suspense>
  );
}
