import type { Metadata } from "next";

import { FirmShell } from "@/components/firm/shell";

export const metadata: Metadata = {
  title: { default: "Practice", template: "%s · SpeedNum" },
  robots: { index: false, follow: false },
};

export default function FirmLayout({ children }: LayoutProps<"/">) {
  return <FirmShell>{children}</FirmShell>;
}
