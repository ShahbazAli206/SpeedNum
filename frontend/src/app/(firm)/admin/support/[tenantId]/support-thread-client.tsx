"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";

import { DashboardHeader } from "@/components/dashboard/page-shell";
import { Conversation } from "@/components/support/conversation";
import { ButtonLink } from "@/components/ui";
import { post } from "@/lib/api";
import type { SupportAttachmentDraft } from "@/lib/storage";
import { notifySupportUnreadChanged } from "@/lib/support-events";
import type { SupportMessage, SupportThreadDetail } from "@/lib/types";

export function SupportThreadClient({
  tenantId,
  detail,
  live,
}: {
  tenantId: string;
  detail: SupportThreadDetail;
  live: boolean;
}) {
  useEffect(() => {
    if (!live) return;
    // Opening the company's thread clears its unread count in the inbox.
    post(`/admin/support/threads/${tenantId}/read`)
      .then(() => notifySupportUnreadChanged())
      .catch(() => {
        // A failed mark-read just leaves the badge up; not worth a toast.
      });
  }, [live, tenantId]);

  const onSend = (body: string, attachments: SupportAttachmentDraft[]) =>
    post<SupportMessage>(`/admin/support/threads/${tenantId}/messages`, { body, attachments });

  return (
    <>
      <DashboardHeader
        title={detail.tenant_name}
        subtitle="Your support conversation with this company"
        actions={
          <ButtonLink href="/admin/support" variant="secondary" icon={<ArrowLeft className="size-4" />}>
            All companies
          </ButtonLink>
        }
      />
      <Conversation
        initialMessages={detail.messages}
        meIsPlatform={true}
        scope={{ kind: "platform", tenantId }}
        otherName={detail.tenant_name}
        emptyTitle="No messages yet"
        emptyDescription={`Start the conversation with ${detail.tenant_name} — they'll see it in their portal's Support page.`}
        live={live}
        onSend={onSend}
      />
    </>
  );
}
