"use client";

import { useEffect } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { Conversation } from "@/components/support/conversation";
import { post } from "@/lib/api";
import type { SupportAttachmentDraft } from "@/lib/storage";
import { notifySupportUnreadChanged } from "@/lib/support-events";
import type { SupportMessage, SupportThread } from "@/lib/types";

export function SupportClient({ thread, live }: { thread: SupportThread; live: boolean }) {
  useEffect(() => {
    if (!live) return;
    // Opening the conversation clears the "platform replied" badge.
    post("/support/thread/read")
      .then(() => notifySupportUnreadChanged())
      .catch(() => {
        // A failed mark-read just leaves the badge up; not worth a toast.
      });
  }, [live]);

  const onSend = (body: string, attachments: SupportAttachmentDraft[]) =>
    post<SupportMessage>("/support/messages", { body, attachments });

  return (
    <>
      <DashboardHeader
        title="Support"
        subtitle="Message the SpeedNum platform team — questions, issues, anything about your account"
      />
      <Conversation
        initialMessages={thread.messages}
        meIsPlatform={false}
        scope={{ kind: "firm" }}
        otherName="SpeedNum Support"
        emptyTitle="Start a conversation"
        emptyDescription="Send the SpeedNum team a message about your account. Their replies show up right here."
        live={live}
        onSend={onSend}
      />
    </>
  );
}
