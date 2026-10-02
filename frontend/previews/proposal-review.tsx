// Local visual fixture only: no API calls, credentials or project mutations.
import React from "react";
import { createRoot } from "react-dom/client";
import { AiActionReview } from "../src/components/AiActionReview";
import "../src/styles.css";
import "../src/editorial.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main
      className="editorial-page"
      style={{ maxWidth: 950, margin: "0 auto", padding: "32px 20px" }}
    >
      <p>LOCAL DESIGN PREVIEW · Sample data · Nothing can be applied here</p>
      <h1>Review your proposal</h1>
      <p>One new ticket with two separate acceptance criteria.</p>
      <AiActionReview
        plan={{
          summary: "Create a test ticket",
          actions: [
            {
              id: "create",
              type: "task.create",
              tempId: "new:test",
              evidenceIds: [],
              fields: {
                title: "TEST — Verify AI ticket creation",
                description:
                  "Verify that the ticket belongs to this project and both acceptance criteria are saved separately.",
                status: "todo",
                priority: "low",
                taskType: "task",
                dueDate: null,
                startDate: null,
                parentRef: null,
                assigneeId: null,
                sprintId: null
              }
            },
            {
              id: "criterion-1",
              type: "criterion.add",
              taskRef: "new:test",
              evidenceIds: [],
              body: "The ticket belongs to the WorkflowHQ project."
            },
            {
              id: "criterion-2",
              type: "criterion.add",
              taskRef: "new:test",
              evidenceIds: [],
              body: "Both acceptance criteria are saved separately."
            }
          ]
        }}
      />
    </main>
  </React.StrictMode>
);
