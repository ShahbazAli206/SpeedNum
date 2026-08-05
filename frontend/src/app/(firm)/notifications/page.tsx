import type { Metadata } from "next";

import { getNotifications } from "@/lib/firm-demo";

import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationsClient notifications={getNotifications()} />;
}
