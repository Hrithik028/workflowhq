import { Archive, Check, FolderPlus, Plus, RefreshCw, Trash2, Zap } from "lucide-react";

import type { Activity } from "../types";
import { activityCopy, formatRelativeTime } from "../utils/format";

const iconFor = (activity: Activity) => {
  if (activity.action === "task_completed") return Check;
  if (activity.action === "task_created") return Plus;
  if (activity.action === "project_created") return FolderPlus;
  if (activity.action.includes("deleted")) return Trash2;
  if (activity.action.includes("archived")) return Archive;
  if (activity.action === "task_priority_changed") return Zap;
  return RefreshCw;
};

function ActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <aside className="activity-panel">
      <header>
        <div>
          <span className="overline">Live context</span>
          <h2>Recent activity</h2>
        </div>
        <span className="live-indicator">
          <i /> Live
        </span>
      </header>
      <div className="activity-list">
        {activities.map((activity) => {
          const Icon = iconFor(activity);
          return (
            <article className="activity-item" key={activity.id}>
              <span className="activity-icon">
                <Icon size={15} />
              </span>
              <div>
                <p>{activityCopy(activity)}</p>
                <span>{formatRelativeTime(activity.createdAt)}</span>
              </div>
            </article>
          );
        })}
        {activities.length === 0 ? (
          <p className="empty-copy">Your latest changes will appear here.</p>
        ) : null}
      </div>
    </aside>
  );
}

export default ActivityFeed;
