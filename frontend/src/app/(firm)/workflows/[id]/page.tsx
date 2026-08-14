import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getClients, getTask, getTeam, TASK_IDS } from "@/lib/firm-demo";

import { TaskDetailClient } from "./task-detail-client";

export function generateStaticParams() {
  return TASK_IDS.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/workflows/[id]">): Promise<Metadata> {
  const { id } = await params;
  const task = getTask(id);
  return { title: task ? task.title : "Task not found" };
}

export default async function TaskDetailPage({
  params,
  searchParams,
}: PageProps<"/workflows/[id]">) {
  const { id } = await params;
  const { edit } = await searchParams;
  const task = getTask(id);
  if (!task) notFound();

  return (
    <TaskDetailClient
      task={task}
      clients={getClients()}
      team={getTeam().filter((member) => member.is_active)}
      initialEditing={edit === "1"}
    />
  );
}
