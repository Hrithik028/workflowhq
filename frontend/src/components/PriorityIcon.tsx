import { ChevronsDown, ChevronsUp, Equal } from "lucide-react";

import type { TaskPriority } from "../types";

const priorityIcon: Record<TaskPriority, typeof ChevronsUp> = {
  high: ChevronsUp,
  medium: Equal,
  low: ChevronsDown
};

interface PriorityIconProps {
  priority: TaskPriority;
  size?: number;
}

function PriorityIcon({ priority, size = 13 }: PriorityIconProps) {
  const Icon = priorityIcon[priority];
  return <Icon aria-hidden="true" size={size} />;
}

export default PriorityIcon;
