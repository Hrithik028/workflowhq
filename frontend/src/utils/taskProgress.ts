import type { Task } from "../types";

export const persistedProgressFor = (task: Task) => {
  if (task.childCount > 0) {
    return Math.round((task.completedChildCount / task.childCount) * 100);
  }
  return task.status === "completed" ? 100 : 0;
};
