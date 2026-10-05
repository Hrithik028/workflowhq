# Jira one-time import (Phase 3)

The first Jira phase imports a **CSV export** into one existing WorkflowHQ project. It does not
connect to Jira or write anything back to Jira. Direct OAuth connection and ongoing reconciliation
belong to the later Jira synchronization phase.

## Use it

1. In Jira Cloud, open the issue list for the project and export **CSV (all fields)**. Keep each
   export to at most 100 issues and 100 KB. Atlassian's project-export instructions are at
   https://support.atlassian.com/jira/kb/how-to-export-issues-from-jira-cloud-in-csv-format/.
2. In WorkflowHQ, open **Projects → Jira import** on a project you own.
3. Enter the Jira Cloud site root URL (for example `https://team.atlassian.net`) and the Jira
   project key. Upload the CSV and review its mapped status, type, priority and any date warnings.
4. Deselect any issue that should stay in Jira only, then apply the preview. Review the resulting
   WorkflowHQ issue links.

The CSV must contain `Issue key` and `Summary` columns. Description, Issue Type, Status,
Priority, and Due Date are optional. Due dates must use `YYYY-MM-DD`; other date formats are
omitted with a preview warning. Imported tickets are currently flat; hierarchy, comments,
attachments, assignees, and custom fields are not copied. Keep the original Jira export if those
fields matter. A later phase can extend this mapping without making the current import lossy by
surprise.

Only project owners with ticket-creation permission can preview and apply. Previews expire after
30 minutes, can be applied once, and create selected tickets in a database transaction. Stable
`site URL + Jira issue key` mappings make retries skip already imported issues. The activity log
records site and counts, not CSV contents. Only a hash of the normalized preview is persisted;
the browser sends the CSV again on apply and the server rejects any change since preview. Expired
preview metadata is cleared opportunistically when another preview is created.
