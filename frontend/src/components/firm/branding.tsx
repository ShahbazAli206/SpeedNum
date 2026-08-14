"use client";

/**
 * Live firm branding for the staff app.
 *
 * globals.css documents the intent ("Firm branding may override --brand at
 * runtime from the tenant record") but nothing wired it up until now. There is
 * no tenant-settings API for this demo shell to call, so the Settings page
 * writes here instead: colours and font apply immediately, app-wide, via CSS
 * custom properties, and persist to localStorage so they survive a reload —
 * the same trick FirmShell already uses for the collapsed-rail preference.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { FIRM } from "@/lib/firm-demo";

const STORAGE_KEY = "speednum-firm-branding";

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
  logoDataUrl: string | null;
}

export const DEFAULT_BRANDING: FirmBranding = {
  name: FIRM.name,
  tagline: "Tax, Accounting & Compliance",
  primary: "#0a8f4e",
  primaryDark: "#077a42",
  font: "default",
  phone: "+1 (416) 555-0100",
  email: "hello@harrisoncpa.ca",
  address: `${FIRM.city}, ${FIRM.province} · Canada`,
  logoDataUrl: null,
};

function loadBranding(): FirmBranding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function saveBranding(branding: FirmBranding) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(branding));
  } catch {
    // Private-mode quota failure — the in-memory value still applies this session.
  }
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
  setBranding: (next: FirmBranding) => void;
} | null>(null);

export function FirmBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBrandingState] = useState<FirmBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    const loaded = loadBranding();
    // One-shot read of an external store the server cannot see, applied
    // immediately so the very first paint on this device is already themed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrandingState(loaded);
    applyBranding(loaded);
  }, []);

  const setBranding = (next: FirmBranding) => {
    setBrandingState(next);
    saveBranding(next);
    applyBranding(next);
  };

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>{children}</BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) throw new Error("useBranding must be used inside <FirmBrandingProvider>");
  return context;
}
