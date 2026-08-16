import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new SpeedNum password.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
