import type { Activity, TaskStatus } from "../types";

export const formatDate = (value: string | null) => {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00`)
  );
};

export const formatRelativeTime = (value: string) => {
  const delta = new Date(value).getTime() - Date.now();
  const minutes = Math.round(delta / 60_000);
  if (Math.abs(minutes) < 60)
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24)
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(hours, "hour");
  const days = Math.round(hours / 24);
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day");
};

export const statusLabel: Record<TaskStatus, string> = {
  todo: "Ready",
  in_progress: "In motion",
  completed: "Shipped"
};

export const activityCopy = (activity: Activity) => {
  const title = `“${activity.entityTitle}”`;
  switch (activity.action) {
    case "task_created":
      return `Created ${title}`;
    case "task_completed":
      return `Completed ${title}`;
    case "task_status_changed":
      return `Moved ${title} to ${statusLabel[activity.details.to as TaskStatus] ?? activity.details.to}`;
    case "task_priority_changed":
      return `Changed ${title} priority to ${activity.details.to}`;
    case "task_parent_changed":
      return `Changed ${title} parent ticket`;
    case "task_deleted":
      return `Deleted ${title}`;
    case "project_created":
      return `Created project ${title}`;
    case "project_deleted":
      return `Deleted project ${title}`;
    default:
      return `Updated ${title}`;
  }
};

export const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};
