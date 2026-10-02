import type { AiActionPlan } from "../types";

export function AiActionReview({ plan }: { plan: AiActionPlan }) {
  return (
    <section aria-label="Proposed actions" className="ai-action-review">
      <p>
        Review every action below. Nothing changes until you approve the entire plan. An invalid or
        stale ticket blocks the plan.
      </p>
      <ol>
        {plan.actions.map((action) => (
          <li key={action.id}>
            <strong>{action.type}</strong>{" "}
            <span>
              {"taskRef" in action ? `Ticket ${action.taskRef}` : `New ticket ${action.tempId}`}
            </span>
            {"taskRef" in action && typeof action.taskRef === "number" ? (
              <a href={`/tasks/${action.taskRef}`} target="_blank" rel="noopener noreferrer">
                {" "}
                Review current ticket
              </a>
            ) : null}
            {"expectedVersion" in action && action.expectedVersion ? (
              <small> · reviewed version {action.expectedVersion}</small>
            ) : null}
            {"criterionId" in action ? <p>Criterion #{action.criterionId}</p> : null}
            {"body" in action ? <p>{action.body}</p> : null}
            {"fields" in action ? (
              <dl>
                {Object.entries(action.fields).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value === null ? "Clear value" : String(value)}</dd>
                  </div>
                ))}
              </dl>
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
            {action.evidenceIds.length ? (
              <small>Evidence: {action.evidenceIds.join(", ")}</small>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
