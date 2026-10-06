# Phase 4: notifications

The local implementation adds durable in-app notifications for task assignments, comments on a task you created or are assigned to, direct project membership additions and accepted invitations. Notification creation happens in the same database transaction as the triggering change. Self-notifications are skipped, and a task assignment is deduplicated by task version.

## Access and lifecycle

- `GET /api/notifications` returns the signed-in user's visible alerts, newest first. `unreadOnly`, `limit` (1–100), and `offset` support filtering and pagination; the response includes `unreadCount` and `hasMore`.
- `POST /api/notifications/:id/read` and `POST /api/notifications/read-all` update only that user's visible alerts.
- Project-scoped alerts disappear from the recipient's feed if their project membership is revoked. Deleting a project removes its alerts through the database foreign key.
- With workspace isolation enabled, feed and read actions are limited to the active workspace as well as the recipient's current project access.
- The Notifications page opens the related ticket or project and marks an unread alert as read.

## Release smoke test

1. Apply migration `034_notifications.sql` before deploying the backend. The isolated notifications branch originally used 031; this integration renumbers that unapplied migration to avoid colliding with custom workflows. Verify the target database's migration history before publishing.
2. In a non-production workspace, invite a second account to a project and have them accept. Assign a new ticket to that account.
3. Sign in as the assignee and confirm one unread assignment alert. Open it; confirm the correct ticket opens and the unread count falls to zero.
4. Add a comment from the assignee, then sign in as the ticket creator and confirm a comment alert.
5. Remove the assignee from the project and confirm project alerts are no longer visible to them.

Email delivery is optional in the roadmap and is not enabled by this phase. In-app alerts remain available without an email provider or new environment variables.
