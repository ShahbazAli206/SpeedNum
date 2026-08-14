import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import { getNotifications } from "@/lib/firm-demo";
import { relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";

import { NotificationsClient, type NotificationView } from "./notifications-client";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const live = await apiServer<Notification[]>("/notifications");

  const notifications: NotificationView[] = live
    ? live.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body ?? "",
        link: item.link,
        is_read: item.is_read,
        when: relativeTime(item.created_at),
      }))
    : getNotifications().map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        link: item.link,
        is_read: item.is_read,
        when: item.when,
      }));

  return <NotificationsClient notifications={notifications} isLive={Boolean(live)} />;
}
