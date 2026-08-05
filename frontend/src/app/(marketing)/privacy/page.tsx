import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { PRIVACY } from "@/lib/content/legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} collects, uses and protects personal information, under PIPEDA and provincial privacy law.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`How ${SITE.legalName} collects, uses, shares and protects personal information — under PIPEDA and applicable provincial privacy legislation.`}
      sections={PRIVACY}
    />
  );
}
