import type { Metadata } from "next";

import { apiServer } from "@/lib/api-server";
import { getTasks } from "@/lib/firm-demo";
import type { Task } from "@/lib/types";

import { WorkflowsClient } from "./workflows-client";

export const metadata: Metadata = { title: "Task Master" };

export default async function WorkflowsPage() {
  // WorkflowsClient already persists every move/edit/delete to the real API
  // (patch/del calls in workflows-client.tsx) — only the initial load was
  // still demo data. Falls back to it only if the API is unreachable, same
  // convention as services/page.tsx.
  const tasks = (await apiServer<Task[]>("/tasks")) ?? getTasks();
  const assignees = [...new Set(tasks.map((task) => task.assignee_name).filter((name): name is string => Boolean(name)))].sort();

  return <WorkflowsClient tasks={tasks} assignees={assignees} />;
}
