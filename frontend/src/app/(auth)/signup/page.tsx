import type { Metadata } from "next";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Start your free SpeedNum trial — no credit card required.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return <SignupForm />;
}
