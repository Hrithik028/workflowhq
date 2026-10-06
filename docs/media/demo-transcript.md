# WorkflowHQ — captioned product walkthrough

**72 seconds; no audio.** Actual demo interface with sample data, followed by explanatory diagrams.
No production actions, real provider generation or webhook success are demonstrated.

| Time        | Chapter                    | Caption                                                           |
| ----------- | -------------------------- | ----------------------------------------------------------------- |
| 00:00–00:06 | WorkflowHQ                 | Plan the work. Follow the code. Approve the AI.                   |
| 00:06–00:14 | Engineering command center | See tickets, reviews and delivery signals in one workspace.       |
| 00:14–00:22 | Projects                   | Projects group outcomes, ownership and delivery progress.         |
| 00:22–00:30 | Workflow                   | Use the board, filters and accessible status controls.            |
| 00:30–00:38 | Ticket detail              | Ticket hierarchies and acceptance criteria keep scope visible.    |
| 00:38–00:45 | Calendar                   | The calendar puts sample due dates in context.                    |
| 00:45–00:52 | Analytics                  | Issue counts describe work state, not individual productivity.    |
| 00:52–01:02 | AI approval                | Backend validation, human review and atomic apply protect writes. |
| 01:02–01:12 | Architecture               | React + Express + PostgreSQL; signed webhooks and governed AI.    |

The sample ticket screen illustrates criteria and repository context together.
The sample dashboard is explicitly not live repository evidence.
AI diagrams explain the implemented approval boundary: choose scope, generate a read-only
proposal, validate it, review, approve and apply atomically.

For a real integration test, connect a selected repository to a project, create a ticket,
include its exact key in a controlled branch or PR, then verify the signed activity and
configured automation. For AI, use your own approved provider credential and inspect the
proposal before applying controlled test changes.
