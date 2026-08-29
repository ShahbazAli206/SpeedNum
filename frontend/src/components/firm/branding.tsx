"use client";

/**
 * Live firm branding for the staff app, backed by the real tenant record
 * (`GET/PATCH /settings/tenant`) rather than localStorage — the tenant's
 * `brand_color`/`accent_color` are the same fields emails (letter_invite_html,
 * portal.py's PortalBrand) and the engagement-letter PDF already read, so a
 * change here now actually reaches those surfaces instead of being a
 * per-browser-only visual preference. Colour/font apply immediately via CSS
 * custom properties, same as before; `font`/`tagline`/`phone`/`address` have
 * no first-class Tenant column, so they ride in the tenant's own free-form
 * `settings` JSONB (already exists for exactly this kind of extra field).
 */

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { patch } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Tenant } from "@/lib/types";

export interface FontOption {
  value: string;
  label: string;
  /** Google Fonts `family=` query fragment; omitted for the shipped default. */
  google?: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: "default", label: "Default (Inter)" },
  { value: "inter", label: "Inter", google: "Inter:wght@400;500;600;700" },
  { value: "roboto", label: "Roboto", google: "Roboto:wght@400;500;700" },
  { value: "open-sans", label: "Open Sans", google: "Open+Sans:wght@400;500;600;700" },
  { value: "lato", label: "Lato", google: "Lato:wght@400;700" },
  { value: "poppins", label: "Poppins", google: "Poppins:wght@400;500;600;700" },
  { value: "montserrat", label: "Montserrat", google: "Montserrat:wght@400;500;600;700" },
  { value: "nunito", label: "Nunito", google: "Nunito:wght@400;600;700" },
  { value: "work-sans", label: "Work Sans", google: "Work+Sans:wght@400;500;600;700" },
  { value: "source-sans", label: "Source Sans", google: "Source+Sans+3:wght@400;600;700" },
];

export interface FirmBranding {
  name: string;
  tagline: string;
  primary: string;
  primaryDark: string;
  font: string;
  phone: string;
  email: string;
  address: string;
  logoUrl: string;
}

export const FALLBACK_BRANDING: FirmBranding = {
  name: "Your Firm",
  tagline: "",
  primary: "#1d4ed8",
  primaryDark: "#0f172a",
  font: "default",
  phone: "",
  email: "",
  address: "",
  logoUrl: "",
};

function fromTenant(tenant: Tenant | null): FirmBranding {
  if (!tenant) return FALLBACK_BRANDING;
  const extra = (tenant.settings ?? {}) as Record<string, unknown>;
  return {
    name: tenant.name,
    tagline: typeof extra.tagline === "string" ? extra.tagline : "",
    primary: tenant.brand_color || FALLBACK_BRANDING.primary,
    primaryDark: tenant.accent_color || FALLBACK_BRANDING.primaryDark,
    font: typeof extra.font === "string" ? extra.font : "default",
    phone: tenant.phone || "",
    email: tenant.email || "",
    address:
      typeof extra.address === "string"
        ? extra.address
        : [tenant.city, tenant.province].filter(Boolean).join(", "),
    logoUrl: tenant.logo_url || "",
  };
}

const FONT_LINK_ID = "firm-branding-font";

function ensureFontLink(google: string) {
  const href = `https://fonts.googleapis.com/css2?family=${google}&display=swap`;
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

/** Pushes colours/font onto `:root` so every page re-themes immediately. */
function applyBranding(branding: FirmBranding) {
  const root = document.documentElement;
  root.style.setProperty("--brand", branding.primary);
  root.style.setProperty("--brand-strong", branding.primaryDark);
  root.style.setProperty("--brand-soft", `color-mix(in oklab, ${branding.primary} 12%, white)`);
  root.style.setProperty("--brand-ink", `color-mix(in oklab, ${branding.primary} 55%, black)`);

  const font = FONT_OPTIONS.find((option) => option.value === branding.font);
  if (font?.google) {
    ensureFontLink(font.google);
    const stack = `'${font.label}', ui-sans-serif, system-ui, sans-serif`;
    root.style.setProperty("--font-sans", stack);
    root.style.setProperty("--font-display", stack);
  } else {
    root.style.removeProperty("--font-sans");
    root.style.removeProperty("--font-display");
  }
}

const BrandingContext = createContext<{
  branding: FirmBranding;
  /** Persists to the tenant record via PATCH /settings/tenant (admin-only —
   * the backend enforces this regardless of what the form shows) and
   * re-themes immediately on success. Throws on failure so the caller's
   * save button can show a real error instead of a fabricated success toast. */
  saveBranding: (next: FirmBranding) => Promise<void>;
} | null>(null);

export function FirmBrandingProvider({ children }: { children: ReactNode }) {
  const { me, refresh } = useSession();
  const [branding, setBrandingState] = useState<FirmBranding>(FALLBACK_BRANDING);
  // /admin/** is the cross-tenant superadmin console — it must look the same
  // no matter which firm the logged-in superadmin happens to own, so it never
  // wears one tenant's logo/colours/font. Everywhere else in the (firm) group
  // is that tenant's own staff-facing area, where its branding belongs.
  const isProviderConsole = usePathname()?.startsWith("/admin") ?? false;

  useEffect(() => {
    const next = isProviderConsole ? FALLBACK_BRANDING : fromTenant(me?.tenant ?? null);
    // One-shot sync from an external store (the session's tenant fetch) the
    // server render can't see, applied immediately so the first paint on
    // this device already reflects the saved brand colours.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrandingState(next);
    applyBranding(next);
  }, [me?.tenant, isProviderConsole]);

  const saveBranding = async (next: FirmBranding) => {
    const previousSettings = (me?.tenant?.settings ?? {}) as Record<string, unknown>;
    await patch("/settings/tenant", {
      name: next.name,
      phone: next.phone || null,
      email: next.email || null,
      brand_color: next.primary,
      accent_color: next.primaryDark,
      logo_url: next.logoUrl || null,
      settings: { ...previousSettings, tagline: next.tagline, font: next.font, address: next.address },
    });
    setBrandingState(next);
    applyBranding(next);
    refresh(); // re-pulls /auth/me so other components (sidebar name, etc.) see the change too
  };

  return (
    <BrandingContext.Provider value={{ branding, saveBranding }}>{children}</BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) throw new Error("useBranding must be used inside <FirmBrandingProvider>");
  return context;
}
