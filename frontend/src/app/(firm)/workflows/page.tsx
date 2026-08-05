import type { Metadata } from "next";

import { getProjects, getTasks } from "@/lib/firm-demo";

import { WorkflowsClient } from "./workflows-client";

export const metadata: Metadata = { title: "Task Master" };

export default function WorkflowsPage() {
  const tasks = getTasks();
  const assignees = [...new Set(tasks.map((task) => task.assignee_name))].sort();

  return <WorkflowsClient projects={getProjects()} tasks={tasks} assignees={assignees} />;
}
