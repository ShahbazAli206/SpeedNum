/**
 * Auth helpers shared by the login and signup forms.
 *
 * Supabase is optional in this build: when the env vars are absent the app runs
 * in demo mode and the portal is browsable without a real session. That is the
 * same assumption `src/proxy.ts` makes — it lets every request through rather
 * than locking the site out when Supabase is unconfigured.
 */

export const SUPABASE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | undefined {
  if (!value.trim()) return "Enter your work email.";
  if (!EMAIL_PATTERN.test(value.trim())) return "That doesn't look like an email address.";
  return undefined;
}

export function validatePassword(value: string, minimum = 6): string | undefined {
  if (!value) return "Enter your password.";
  if (value.length < minimum) return `Use at least ${minimum} characters.`;
  return undefined;
}

/** Rough strength signal for the signup field — indicative, not a policy. */
export function passwordStrength(value: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;

  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: clamped, label: labels[clamped] };
}
