# PostgreSQL backup and restore runbook

This runbook is provider-neutral. It defines the evidence WorkflowHQ needs before a
developer-beta release without publishing database credentials or host-specific instructions.

## Safety boundaries

- Never paste a production connection string into a ticket, command log, screenshot, or source
  file. Supply it through the operator's secret manager or a temporary process environment.
- Never test a restore against the production database. Restore into a new, disposable database.
- Use a PostgreSQL client version that is the same major version as the server or newer.
- Store backup artifacts outside the repository and encrypt them at rest.
- Record only the backup timestamp, PostgreSQL version, checksum, size, and verification result.

## Create a backup

1. Confirm the application health endpoint and record the release commit.
2. Create a timestamped destination outside the repository with access restricted to the operator.
3. Run `pg_dump` in custom format with ownership and access-control commands omitted:

   ```text
   pg_dump --format=custom --no-owner --no-privileges --file <backup-path> <source-connection>
   ```

4. Generate a SHA-256 checksum for the completed artifact.
5. Confirm that the command succeeded, the artifact is non-empty, and the checksum can be read
   back. Do not open or publish the dump.

## Prove the restore

1. Create a new disposable PostgreSQL database with no application traffic.
2. Restore the backup into that database:

   ```text
   pg_restore --exit-on-error --no-owner --no-privileges --dbname <restore-connection> <backup-path>
   ```

3. Point a temporary backend process at the restored database and run:

   ```text
   npm run migrate:status
   ```

4. The command must report zero pending migrations and zero unknown migrations.
5. Verify these minimum invariants without exporting row data:
   - the platform-owner account exists;
   - all active projects retain their tickets and project memberships;
   - ticket hierarchy has no missing parent references;
   - acceptance criteria remain ordered and attached to their tickets;
   - selected GitHub repositories retain their project assignments;
   - development-event links still reference existing tickets;
   - archived projects and tickets remain archived.
6. Start the backend against the disposable database and complete read-only smoke checks for sign
   in, project listing, task details, archive listing, and GitHub development history.
7. Destroy the disposable database only after the verification record has been saved.

## Verification record

Record the following outside the repository's public history:

- backup and restore timestamps;
- source and restore PostgreSQL major versions;
- artifact size and SHA-256 checksum;
- release commit and migration-status summary;
- pass or fail for every invariant above;
- operator name and the approved rollback decision;
- deletion date for the temporary restore and backup artifact.

Do not record database URLs, passwords, raw table contents, GitHub credentials, JWT secrets, or
the backup artifact itself.

## Rollback decision

- Prefer rolling the application image back when the failure is in application code and the
  deployed migrations remain compatible.
- Do not edit or reverse an applied migration file.
- Restore a database backup only for confirmed destructive data corruption and only after stopping
  writes, preserving the failed database for investigation, and obtaining an explicit owner
  decision.
- After either rollback path, rerun the health, authentication, migration-status, hierarchy,
  archive, and GitHub-link smoke checks before reopening traffic.
