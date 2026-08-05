import { CookieBanner } from "@/components/marketing/cookie-banner";
import { Footer } from "@/components/marketing/footer";
import { Header } from "@/components/marketing/header";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <CookieBanner />
    </>
  );
}
