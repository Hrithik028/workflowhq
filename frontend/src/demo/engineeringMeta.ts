import type { Task } from "../types";

export interface EngineeringMeta {
  assignee: string;
  initials: string;
  team: string;
  branch: string;
  commit: string;
  pullRequest: number;
  checksPassed: number;
  checksRunning: number;
  checksFailed: number;
  age: string;
  reviewer: string;
  environment: "staging" | "production";
}

const people = [
  ["Alex Lee", "AL"],
  ["Riley Brown", "RB"],
  ["Jordan Miller", "JM"],
  ["Sam Ortega", "SO"],
  ["Taylor Kim", "TK"],
  ["Ananya Singh", "AS"]
] as const;

const teams = [
  "Platform",
  "Developer experience",
  "Web application",
  "Release engineering",
  "Security",
  "Product engineering"
] as const;

const verbs = ["feature", "fix", "chore", "feature", "security", "release"] as const;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 28);

export const engineeringMetaFor = (task: Task): EngineeringMeta => {
  const person = people[(task.id - 1) % people.length];
  const seed = task.id * 37 + task.title.length;
  return {
    assignee: person[0],
    initials: person[1],
    team: teams[(task.id - 1) % teams.length],
    branch: `${verbs[(task.id - 1) % verbs.length]}/${slugify(task.title)}`,
    commit: seed.toString(16).padStart(7, "0").slice(-7),
    pullRequest: 420 + task.id * 11,
    checksPassed: 4 + (task.id % 5),
    checksRunning: task.status === "in_progress" && task.id % 2 === 0 ? 1 : 0,
    checksFailed:
      task.status !== "completed" && task.priority === "high" && task.id % 2 === 0 ? 1 : 0,
    age: task.id % 3 === 0 ? `${task.id + 1}h ago` : `${Math.max(task.id * 7, 10)}m ago`,
    reviewer: people[(task.id + 2) % people.length][0],
    environment: task.id % 2 === 0 ? "staging" : "production"
  };
};

export const progressFor = (task: Task) => {
  if (task.childCount > 0) {
    return Math.round((task.completedChildCount / task.childCount) * 100);
  }
  if (task.status === "completed") return 100;
  if (task.status === "in_progress") return 45 + (task.id % 4) * 10;
  return task.id % 3 === 0 ? 20 : 0;
};

export const issueTypeLabel = (task: Task) =>
  task.taskType === "subtask"
    ? "Subtask"
    : `${task.taskType.charAt(0).toUpperCase()}${task.taskType.slice(1)}`;
