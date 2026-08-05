import clsx, { type ClassValue } from "clsx";

/**
 * Class-name joiner.
 *
 * This lives outside `components/ui.tsx` on purpose: that file is a client
 * module, and a server component calling a function exported from a client
 * module fails at prerender ("Attempted to call cn() from the server").
 * Keeping it in a plain module lets both sides import it.
 */
export const cn = (...values: ClassValue[]) => clsx(values);
