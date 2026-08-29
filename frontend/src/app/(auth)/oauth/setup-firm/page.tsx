import type { Metadata } from "next";

import { SetupFirmForm } from "./setup-firm-form";

export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

export default function SetupFirmPage() {
  return <SetupFirmForm />;
}
