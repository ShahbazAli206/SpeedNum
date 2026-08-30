import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  BellRing,
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  ChartLine,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Folder,
  Globe,
  HardDrive,
  Kanban,
  Landmark,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Network,
  Palette,
  Plug,
  Receipt,
  Settings,
  ShieldCheck,
  Signature,
  SlidersHorizontal,
  Tag,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the string icon names used in content records (site.ts, features.ts) to
 * components, so content files stay plain data and never import from lucide.
 *
 * Note: lucide-react v1 dropped the brand glyphs (LinkedIn, Facebook, …), so
 * those live in `SocialIcon` below as inline paths rather than in this map.
 */
const ICONS: Record<string, LucideIcon> = {
  "arrow-left-right": ArrowLeftRight,
  "arrow-right": ArrowRight,
  "bar-chart-3": ChartColumn,
  "line-chart": ChartLine,
  bell: Bell,
  "bell-ring": BellRing,
  "calendar-check": CalendarCheck,
  "calendar-clock": CalendarClock,
  "credit-card": CreditCard,
  "file-signature": Signature,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  folder: Folder,
  globe: Globe,
  "hard-drive": HardDrive,
  kanban: Kanban,
  landmark: Landmark,
  "layout-dashboard": LayoutDashboard,
  lock: Lock,
  mail: Mail,
  "map-pin": MapPin,
  "message-square": MessageSquare,
  network: Network,
  palette: Palette,
  plug: Plug,
  receipt: Receipt,
  settings: Settings,
  "shield-check": ShieldCheck,
  "sliders-horizontal": SlidersHorizontal,
  tag: Tag,
  "user-plus": UserPlus,
  users: Users,
  wallet: Wallet,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? Globe;
  return <Component className={className} aria-hidden />;
}

/* -------------------------------------------------------------------------- */
/* Social brand glyphs                                                         */
/* -------------------------------------------------------------------------- */

const SOCIAL_PATHS: Record<string, string> = {
  linkedin:
    "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.71h.05c.53-.95 1.83-1.96 3.77-1.96 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.6c0-1.34-.03-3.07-1.9-3.07-1.9 0-2.2 1.46-2.2 2.97V21h-4V9Z",
  facebook:
    "M14 9h3V5.5h-2.6C11.9 5.5 11 7 11 8.9V11H8.5v3.5H11V22h3.5v-7.5h2.7l.4-3.5H14.5V9.4c0-.3.2-.4.5-.4Z",
  instagram:
    "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .49 1.4.9.42.42.69.83.9 1.4.18.42.37 1.03.43 2.22.06 1.26.07 1.64.07 4.83s0 3.57-.07 4.83c-.06 1.19-.25 1.8-.42 2.22-.22.57-.49.98-.9 1.4-.42.41-.83.68-1.4.9-.42.17-1.03.36-2.22.42-1.26.06-1.64.07-4.83.07s-3.57-.01-4.83-.07c-1.19-.06-1.8-.25-2.22-.42-.57-.22-.98-.49-1.4-.9-.41-.42-.68-.83-.9-1.4-.17-.42-.36-1.03-.42-2.22C2.21 15.6 2.2 15.2 2.2 12s.01-3.57.07-4.83c.06-1.19.25-1.8.42-2.22.22-.57.49-.98.9-1.4.42-.41.83-.68 1.4-.9.42-.17 1.03-.36 2.22-.42C8.43 2.21 8.83 2.2 12 2.2Zm0 3.05a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5Zm0 11.13a4.38 4.38 0 1 1 0-8.76 4.38 4.38 0 0 1 0 8.76Zm7-11.4a1.58 1.58 0 1 1-3.15 0 1.58 1.58 0 0 1 3.15 0Z",
  x: "M17.2 3h3.3l-7.2 8.2L22 21h-6.6l-5.2-6.6L4.3 21H1l7.7-8.8L1.4 3H8l4.7 6.1L17.2 3Zm-1.2 16h1.8L8.1 4.9H6.2L16 19Z",
  youtube:
    "M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3-5.2 3Z",
};

export function SocialIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const path = SOCIAL_PATHS[name];
  if (!path) return null;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d={path} />
    </svg>
  );
}
