import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { TERMS } from "@/lib/content/legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms governing your access to and use of the ${SITE.name} platform.`,
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These terms govern your access to and use of ${SITE.legalName}'s practice-management platform, websites and related services.`}
      sections={TERMS}
    />
  );
}
