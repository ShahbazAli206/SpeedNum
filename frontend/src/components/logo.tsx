import Link from "next/link";

import { SITE } from "@/lib/site";

import { cn } from "@/lib/cn";

/**
 * The SpidNums mark: a rounded tile holding an ascending bar chart whose last
 * bar breaks out into an arrow — "numbers moving up, fast".
 *
 * `tone` picks the palette: `brand` for light backgrounds, `invert` for the
 * navy bands and the auth split where the tile sits on dark.
 */
export function LogoMark({
  size = 34,
  tone = "brand",
  className,
}: {
  size?: number;
  tone?: "brand" | "invert";
  className?: string;
}) {
  const tile = tone === "invert" ? "#ffffff" : "var(--brand)";
  const bars = tone === "invert" ? "var(--brand)" : "#ffffff";
  const dim = tone === "invert" ? "rgba(10,143,78,0.45)" : "rgba(255,255,255,0.5)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label={`${SITE.name} logo`}
      className={cn("shrink-0", className)}
    >
      <rect width="40" height="40" rx="11" fill={tile} />
      <rect x="9" y="22" width="4.5" height="9" rx="1.6" fill={dim} />
      <rect x="17.75" y="17" width="4.5" height="14" rx="1.6" fill={bars} />
      <path
        d="M26.5 31V15.5"
        stroke={bars}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M22.6 13.2 26.5 9l3.9 4.2"
        stroke={bars}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  href = "/",
  size = 34,
  tone = "brand",
  sublabel,
  className,
  logoUrl,
}: {
  href?: string | null;
  size?: number;
  tone?: "brand" | "invert";
  /** Small caps line under the wordmark, e.g. "CLIENT" in the portal. */
  sublabel?: string;
  className?: string;
  /** The tenant's own uploaded logo (Settings → Branding). When set, this
   * replaces the SpidNums mark + wordmark everywhere `<Logo>` is used, so a
   * firm's chosen logo actually shows up in the chrome instead of only in
   * the settings-page preview. */
  logoUrl?: string | null;
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="shrink-0 rounded-lg object-contain"
          style={{ height: size, maxWidth: size * 3.5 }}
        />
      ) : (
        <LogoMark size={size} tone={tone} />
      )}
      {logoUrl && !sublabel ? null : (
        <span className="flex flex-col leading-none">
          {logoUrl ? null : (
            <span
              className={cn(
                "font-display font-extrabold tracking-tight",
                tone === "invert" ? "text-white" : "text-ink",
              )}
              style={{ fontSize: size * 0.53 }}
            >
              Spid
              <span className={tone === "invert" ? "text-brand-on-dark" : "text-brand"}>Nums</span>
            </span>
          )}
          {sublabel ? (
            <span
              className={cn(
                "mt-1 text-[10px] font-semibold tracking-[0.18em]",
                tone === "invert" ? "text-white/60" : "text-brand",
              )}
            >
              {sublabel}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex rounded-lg" aria-label={`${SITE.name} home`}>
      {content}
    </Link>
  );
}
