import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { toClientRow, toDemoTask, toTeamRow } from "@/lib/adapt";
import { apiServer } from "@/lib/api-server";
import { getClients, getTask, getTeam } from "@/lib/firm-demo";
import type { Client, Task, TeamMember } from "@/lib/types";

import { TaskDetailClient } from "./task-detail-client";

/**
 * No `generateStaticParams` here — same fix as team/[id]/page.tsx: a real
 * task's id is a UUID that was never in the demo `TASK_IDS` list, so
 * prerendering only those ids 404'd every real task before the page could
 * even ask the API. Rendering on demand costs one request and makes both
 * cases work.
 */
async function loadLive(id: string) {
  const tasks = await apiServer<Task[]>("/tasks");
  if (!tasks) return null;
  const task = tasks.find((row) => row.id === id);
  if (!task) return null;

  const [clients, team] = await Promise.all([
    apiServer<Client[]>("/clients"),
    apiServer<TeamMember[]>("/team"),
  ]);
  return { task, clients: clients ?? [], team: team ?? [] };
}

export async function generateMetadata({
  params,
}: PageProps<"/workflows/[id]">): Promise<Metadata> {
  const { id } = await params;
  const live = await loadLive(id);
  if (live) return { title: live.task.title };
  const task = getTask(id);
  return { title: task ? task.title : "Task not found" };
}

export default async function TaskDetailPage({
  params,
  searchParams,
}: PageProps<"/workflows/[id]">) {
  const { id } = await params;
  const { edit } = await searchParams;

  const live = await loadLive(id);
  if (live) {
    return (
      <TaskDetailClient
        task={toDemoTask(live.task)}
        clients={live.clients.map(toClientRow)}
        team={live.team.filter((member) => member.is_active).map(toTeamRow)}
        initialEditing={edit === "1"}
        isLive
      />
    );
  }

  const task = getTask(id);
  if (!task) notFound();

  return (
    <TaskDetailClient
      task={task}
      clients={getClients()}
      team={getTeam().filter((member) => member.is_active)}
      initialEditing={edit === "1"}
      isLive={false}
    />
  );
}
