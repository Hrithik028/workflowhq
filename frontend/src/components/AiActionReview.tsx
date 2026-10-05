import type { AiActionPlan, AiProposalRevision } from "../types";

type Action = AiActionPlan["actions"][number];
const labels: Record<Action["type"], string> = {
  "task.create": "Create ticket",
  "task.update": "Update ticket",
  "task.archive": "Archive ticket",
  "task.restore": "Restore ticket",
  "criterion.add": "Add acceptance criterion",
  "criterion.update": "Edit acceptance criterion",
  "criterion.complete": "Complete acceptance criterion",
  "criterion.remove": "Remove acceptance criterion",
  "criterion.reorder": "Reorder acceptance criteria"
};
const fieldLabels: Record<string, string> = {
  title: "Title",
  description: "Description",
  status: "Status",
  priority: "Priority",
  taskType: "Issue type",
  parentRef: "Parent ticket",
  dueDate: "Due date",
  startDate: "Start date",
  assigneeId: "Assignee",
  sprintId: "Sprint",
  body: "Criterion text",
  completed: "Completed"
};
const values: Record<string, string> = {
  todo: "Ready",
  in_progress: "In motion",
  completed: "Shipped",
  low: "Low",
  medium: "Medium",
  high: "High",
  initiative: "Initiative",
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
  subtask: "Subtask"
};

export function AiActionReview({
  plan,
  state = "pending",
  expired = false
}: {
  plan: AiActionPlan;
  state?: AiProposalRevision["state"];
  expired?: boolean;
}) {
  const pending = state === "pending" && !expired;
  const stateLabel =
    state === "applied" ? "Applied" : pending ? "Nothing applied yet" : "Not applied";
  const newTickets = new Map<number | string, string>(
    plan.actions.flatMap((action) =>
      action.type === "task.create" ? [[action.tempId, action.fields.title] as const] : []
    )
  );
  const targetName = (ref: number | string) =>
    typeof ref === "number" ? `Ticket #${ref}` : newTickets.get(ref) || ref;
  const groups: { action: Action; criteria: Extract<Action, { type: "criterion.add" }>[] }[] = [];
  // Group consecutive additions only, preserving the exact execution order.
  for (const action of plan.actions) {
    const previous = groups.at(-1);
    if (
      action.type === "criterion.add" &&
      previous?.action.type === "task.create" &&
      action.taskRef === previous.action.tempId
    )
      previous.criteria.push(action);
    else groups.push({ action, criteria: [] });
  }
  const displayValue = (key: string, value: unknown) => {
    if (value === null) return "Clear value";
    if (key === "parentRef") return targetName(value as number | string);
    return ["status", "priority", "taskType"].includes(key)
      ? values[String(value)] || String(value)
      : String(value);
  };
  return (
    <section aria-label="Proposed actions" className="ai-action-review">
      <div className="ai-action-review-intro">
        <strong>
          {plan.actions.length} {state === "applied" ? "approved" : "proposed"} changes ·{" "}
          {stateLabel}
        </strong>
        <p>
          {pending
            ? "Review the ticket details and criteria, then confirm below. All changes apply together; an invalid or stale ticket blocks the plan."
            : state === "applied"
              ? "These approved changes were applied. This revision is retained for reference and cannot be approved again."
              : "This revision is retained for reference. Its changes have not been applied."}
        </p>
      </div>
      <ol className="ai-action-cards">
        {groups.map(({ action, criteria }, index) => (
          <li key={action.id} className="ai-action-card">
            <header>
              <span className="ai-action-number">{index + 1}</span>
              <div>
                <small>{labels[action.type]}</small>
                <h4>
                  {action.type === "task.create" ? action.fields.title : targetName(action.taskRef)}
                </h4>
              </div>
              {"taskRef" in action && typeof action.taskRef === "number" ? (
                <a href={`/tasks/${action.taskRef}`} target="_blank" rel="noopener noreferrer">
                  Review current ticket
                </a>
              ) : null}
            </header>
            {"criterionId" in action ? <p>Criterion #{action.criterionId}</p> : null}
            {"body" in action ? <p>{action.body}</p> : null}
            {"fields" in action ? (
              <dl>
                {Object.entries(action.fields)
                  .filter(
                    ([key, value]) =>
                      action.type !== "task.create" || (key !== "title" && value !== null)
                  )
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{fieldLabels[key] || key}</dt>
                      <dd>{displayValue(key, value)}</dd>
                    </div>
                  ))}
              </dl>
            ) : null}
            {criteria.length ? (
              <section
                className="ai-grouped-criteria"
                aria-label="Acceptance criteria for new ticket"
              >
                <h5>Acceptance criteria · {criteria.length}</h5>
                <ul>
                  {criteria.map((criterion) => (
                    <li key={criterion.id}>{criterion.body}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {"criterionIds" in action ? (
              <p>Criterion order: {action.criterionIds.join(" → ") || "Empty"}</p>
            ) : null}
            {action.type === "task.archive" || action.type === "criterion.remove" ? (
              <p className="form-alert error">
                This action removes work from the active view or removes a criterion. Check the
                target carefully.
              </p>
            ) : null}
            <details className="ai-action-technical">
              <summary>Technical details</summary>
              <p>
                Action: {action.type} · Reference:{" "}
                {"taskRef" in action ? action.taskRef : action.tempId}
              </p>
              {"expectedVersion" in action && action.expectedVersion ? (
                <p>reviewed version {action.expectedVersion}</p>
              ) : null}
              {action.type === "task.create" ? (
                <dl>
                  {Object.entries(action.fields)
                    .filter(([, value]) => value === null)
                    .map(([key]) => (
                      <div key={key}>
                        <dt>{fieldLabels[key] || key}</dt>
                        <dd>Not set</dd>
                      </div>
                    ))}
                </dl>
              ) : null}
              {criteria.map((criterion) => (
                <p key={criterion.id}>
                  {criterion.id}: criterion.add · {criterion.taskRef}
                  {criterion.evidenceIds.length
                    ? ` · Evidence: ${criterion.evidenceIds.join(", ")}`
                    : ""}
                </p>
              ))}
              {action.evidenceIds.length ? <p>Evidence: {action.evidenceIds.join(", ")}</p> : null}
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
