import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Github,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  Unplug
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { githubApi } from "../api/github";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import GitHubOperationsPanels from "../components/GitHubOperationsPanels";
import type {
  GitHubActorIdentity,
  GitHubIdentityDirectory,
  GitHubInstallation,
  GitHubIntegrationStatus,
  GitHubRepository,
  GitHubWebhookFailure,
  Project
} from "../types";
import { formatRelativeTime } from "../utils/format";
import { isAllowedGitHubInstallUrl } from "../utils/github";

const disconnectedStatus: GitHubIntegrationStatus = { connected: false, installations: [] };
const emptyIdentityDirectory: GitHubIdentityDirectory = { actors: [], members: [] };
const localPreviewIdentities: GitHubIdentityDirectory = {
  actors: [
    {
      installationId: 7,
      accountLogin: "Hrithik028",
      actorLogin: "hrithik-kapoor",
      eventCount: 18,
      lastSeenAt: "2026-09-04T00:00:00.000Z",
      mapping: {
        id: 3,
        installationId: 7,
        githubLogin: "hrithik-kapoor",
        mappedUserId: 2,
        mappedUserName: "Hrithik Kapoor",
        mappedUserEmail: "hrithik@example.com",
        updatedAt: "2026-09-04T00:00:00.000Z"
      }
    },
    {
      installationId: 7,
      accountLogin: "Hrithik028",
      actorLogin: "ananya-singh",
      eventCount: 9,
      lastSeenAt: "2026-09-03T23:45:00.000Z",
      mapping: null
    }
  ],
  members: [
    {
      installationId: 7,
      userId: 2,
      name: "Hrithik Kapoor",
      email: "hrithik@example.com"
    },
    {
      installationId: 7,
      userId: 3,
      name: "Ananya Singh",
      email: "ananya@example.com"
    }
  ]
};
const localPreviewFailures: GitHubWebhookFailure[] = [
  {
    id: 11,
    githubDeliveryId: "preview-delivery",
    eventName: "pull_request",
    eventAction: "synchronize",
    status: "failed",
    attemptCount: 2,
    errorMessage: "The event could not be linked during a temporary database interruption.",
    receivedAt: "2026-09-04T00:05:00.000Z",
    processedAt: null,
    redeliveryRequestedAt: null,
    redeliveryRequestCount: 0,
    redeliveryAvailable: true,
    redeliveryBlockedReason: null,
    accountLogin: "Hrithik028"
  }
];
const identityKey = (actor: GitHubActorIdentity) =>
  `${actor.installationId}:${actor.actorLogin.toLowerCase()}`;

const statusCopy = (installation: GitHubInstallation) => {
  if (installation.suspendedAt || installation.syncState === "suspended") {
    return {
      icon: ShieldAlert,
      label: "Suspended",
      copy: "GitHub suspended this installation. Re-enable it on GitHub before synchronizing.",
      tone: "suspended"
    };
  }
  if (installation.syncState === "failed" || installation.syncState === "partial") {
    return {
      icon: AlertTriangle,
      label: installation.syncState === "partial" ? "Partially synchronized" : "Sync failed",
      copy: installation.lastError || "The latest synchronization did not complete.",
      tone: "failed"
    };
  }
  if (installation.syncState === "syncing" || installation.syncState === "queued") {
    return {
      icon: LoaderCircle,
      label: installation.syncState === "queued" ? "Sync queued" : "Synchronizing",
      copy: "Repository metadata is being refreshed. Existing data remains available.",
      tone: "syncing"
    };
  }
  if (installation.syncState === "healthy") {
    return {
      icon: CheckCircle2,
      label: "Connected and healthy",
      copy: installation.lastSyncedAt
        ? `Last synchronized ${formatRelativeTime(installation.lastSyncedAt)}.`
        : "The installation is ready.",
      tone: "healthy"
    };
  }
  return {
    icon: Github,
    label: "Connected — first sync pending",
    copy: "Refresh repositories to import the repositories granted to this GitHub App.",
    tone: "never"
  };
};

function GitHubIntegration() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const [status, setStatus] = useState<GitHubIntegrationStatus>(disconnectedStatus);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [identityDirectory, setIdentityDirectory] =
    useState<GitHubIdentityDirectory>(emptyIdentityDirectory);
  const [identityDrafts, setIdentityDrafts] = useState<Record<string, string>>({});
  const [webhookFailures, setWebhookFailures] = useState<GitHubWebhookFailure[]>([]);
  const [projectDrafts, setProjectDrafts] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (isDemo) {
      setStatus(disconnectedStatus);
      setRepositories([]);
      setProjects([]);
      setIdentityDirectory(emptyIdentityDirectory);
      setWebhookFailures([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const nextStatus = await githubApi.getStatus();
      const [nextProjects, nextRepositories, nextIdentities, nextFailures] = await Promise.all([
        workspaceApi.listProjects(),
        nextStatus.connected ? githubApi.listRepositories() : Promise.resolve([]),
        nextStatus.connected
          ? githubApi.getIdentityDirectory()
          : Promise.resolve(emptyIdentityDirectory),
        nextStatus.connected ? githubApi.listWebhookFailures() : Promise.resolve([])
      ]);
      setStatus(nextStatus);
      setProjects(nextProjects);
      setRepositories(nextRepositories);
      setIdentityDirectory(nextIdentities);
      setWebhookFailures(nextFailures);
      setProjectDrafts(
        Object.fromEntries(
          nextRepositories.map((repository) => [
            repository.id,
            repository.projectId ? String(repository.projectId) : ""
          ])
        )
      );
      setIdentityDrafts(
        Object.fromEntries(
          nextIdentities.actors.map((actor) => [
            identityKey(actor),
            actor.mapping ? String(actor.mapping.mappedUserId) : ""
          ])
        )
      );
      setNotice(null);
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error, "Unable to load GitHub settings.") });
    } finally {
      setIsLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const connect = async () => {
    setBusyKey("connect");
    setNotice(null);
    try {
      const installUrl = await githubApi.connect();
      if (!isAllowedGitHubInstallUrl(installUrl)) {
        throw new Error("WorkflowHQ received an invalid GitHub installation URL.");
      }
      window.location.assign(installUrl);
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error, "Unable to start GitHub setup.") });
      setBusyKey("");
    }
  };

  const sync = async (installation: GitHubInstallation) => {
    setBusyKey(`sync-${installation.id}`);
    setNotice(null);
    try {
      const result = await githubApi.syncInstallation(installation.id);
      await load();
      if (result.failedRepositories > 0) {
        setNotice({
          tone: "error",
          text: `Repository refresh completed with ${result.failedRepositories} failed repository${result.failedRepositories === 1 ? "" : "ies"}.`
        });
      } else {
        setNotice({
          tone: "success",
          text:
            result.imported > 0
              ? `Repository refresh complete for ${installation.accountLogin}: ${result.imported} development event${result.imported === 1 ? "" : "s"} imported.`
              : `Repository refresh complete for ${installation.accountLogin}. No new development events were found.`
        });
      }
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error, "Unable to refresh repositories.") });
    } finally {
      setBusyKey("");
    }
  };

  const saveRepository = async (repository: GitHubRepository, selected: boolean) => {
    const projectId = projectDrafts[repository.id] ? Number(projectDrafts[repository.id]) : null;
    if (projectId == null) {
      setNotice({
        tone: "error",
        text: "Choose a WorkflowHQ project before changing this repository."
      });
      return;
    }
    setBusyKey(`repository-${repository.id}`);
    setNotice(null);
    try {
      const saved = await githubApi.setRepositorySelection(repository.id, selected, projectId);
      const selectedProject = projects.find((project) => project.id === projectId) || null;
      setRepositories((current) =>
        current.map((item) =>
          item.id === repository.id
            ? {
                ...item,
                ...saved,
                selected,
                projectId: selected ? projectId : null,
                projectKey: selected ? selectedProject?.key || null : null,
                projectName: selected ? selectedProject?.name || null : null
              }
            : item
        )
      );
      setStatus((current) => ({
        ...current,
        installations: current.installations.map((installation) =>
          installation.id === repository.installationId
            ? {
                ...installation,
                selectedRepositoryCount: Math.max(
                  0,
                  installation.selectedRepositoryCount +
                    (selected && !repository.selected
                      ? 1
                      : !selected && repository.selected
                        ? -1
                        : 0)
                )
              }
            : installation
        )
      }));
      setNotice({
        tone: "success",
        text: selected
          ? `${repository.fullName} is linked to ${selectedProject?.key || "the selected project"}.`
          : `${repository.fullName} is no longer selected.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "Unable to update this repository.")
      });
    } finally {
      setBusyKey("");
    }
  };

  const selectedCount = useMemo(
    () => repositories.filter((repository) => repository.selected).length,
    [repositories]
  );

  const saveIdentity = async (actor: GitHubActorIdentity) => {
    const key = identityKey(actor);
    const userId = Number(identityDrafts[key]);
    if (!Number.isSafeInteger(userId) || userId <= 0) return;
    setBusyKey(`identity-${key}`);
    setNotice(null);
    try {
      await githubApi.setIdentityMapping(actor.installationId, actor.actorLogin, userId);
      await load();
      setNotice({ tone: "success", text: `@${actor.actorLogin} is now mapped to a project member.` });
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error, "Unable to map this GitHub actor.") });
    } finally {
      setBusyKey("");
    }
  };

  const removeIdentity = async (actor: GitHubActorIdentity) => {
    if (!actor.mapping) return;
    const key = identityKey(actor);
    setBusyKey(`identity-${key}`);
    setNotice(null);
    try {
      await githubApi.deleteIdentityMapping(actor.mapping.id);
      await load();
      setNotice({ tone: "success", text: `The @${actor.actorLogin} member mapping was removed.` });
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error, "Unable to remove this mapping.") });
    } finally {
      setBusyKey("");
    }
  };

  const retryDelivery = async (delivery: GitHubWebhookFailure) => {
    setBusyKey(`delivery-${delivery.id}`);
    setNotice(null);
    try {
      const receipt = await githubApi.redeliverWebhook(delivery.id);
      setWebhookFailures((current) =>
        current.map((item) =>
          item.id === delivery.id
            ? {
                ...item,
                redeliveryRequestedAt: receipt.redeliveryRequestedAt,
                redeliveryRequestCount: receipt.redeliveryRequestCount,
                redeliveryAvailable: false,
                redeliveryBlockedReason: "cooldown"
              }
            : item
        )
      );
      setNotice({
        tone: "success",
        text: "GitHub accepted the redelivery request. The receipt will update when it arrives."
      });
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error, "Unable to request redelivery.") });
    } finally {
      setBusyKey("");
    }
  };

  return (
    <main className="workspace-page github-integration-page" aria-busy={isLoading}>
      <header className="engineering-page-header github-integration-header">
        <div>
          <span className="overline">Settings / Integrations</span>
          <h1>GitHub connection</h1>
          <p>
            Connect real repositories, assign them to projects, and surface verified development
            history.
          </p>
        </div>
        <Link className="button secondary" to="/settings">
          <ArrowLeft size={16} /> Rules &amp; access
        </Link>
      </header>

      {notice ? (
        <button
          className={`admin-notice ${notice.tone}`}
          type="button"
          onClick={() => setNotice(null)}
        >
          {notice.text}
          <span>×</span>
        </button>
      ) : null}

      {isDemo ? (
        <>
          <section className="github-demo-notice">
            <Github size={26} />
            <div>
              <span className="overline">Preview mode</span>
              <h2>Live GitHub connection is disabled in the demo.</h2>
              <p>
                Sample development data elsewhere in the demo is illustrative and is never
                presented as synchronized account data.
              </p>
            </div>
          </section>
          {import.meta.env.DEV ? (
            <section className="github-local-operations-preview">
              <header>
                <div>
                  <span className="overline">Local Phase 9 preview</span>
                  <h2>Identity and recovery controls</h2>
                </div>
                <strong>Read-only example</strong>
              </header>
              <GitHubOperationsPanels
                busyKey=""
                failures={localPreviewFailures}
                identityDirectory={localPreviewIdentities}
                identityDrafts={{ "7:hrithik-kapoor": "2", "7:ananya-singh": "" }}
                onIdentityDraft={() => undefined}
                onMapIdentity={() => undefined}
                onRemoveIdentity={() => undefined}
                onRetryDelivery={() => undefined}
                readOnly
              />
            </section>
          ) : null}
        </>
      ) : isLoading ? (
        <p className="register-loading">Checking GitHub connection…</p>
      ) : !status.connected ? (
        <section className="github-connect-empty">
          <Github size={40} />
          <span className="overline">Not connected</span>
          <h2>Bring verified GitHub activity into WorkflowHQ.</h2>
          <p>
            Install the WorkflowHQ GitHub App and choose exactly which repositories it can access.
            GitHub credentials and installation tokens never appear in this browser.
          </p>
          <button
            className="button primary"
            disabled={busyKey === "connect"}
            type="button"
            onClick={() => void connect()}
          >
            {busyKey === "connect" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Github size={16} />
            )}
            Connect GitHub
          </button>
        </section>
      ) : (
        <>
          <section className="github-summary" aria-label="GitHub integration summary">
            <article>
              <span>Installations</span>
              <strong>{status.installations.length}</strong>
            </article>
            <article>
              <span>Repositories granted</span>
              <strong>{repositories.length}</strong>
            </article>
            <article>
              <span>Repositories selected</span>
              <strong>{selectedCount}</strong>
            </article>
            <article>
              <span>Projects linked</span>
              <strong>
                {
                  new Set(
                    repositories
                      .filter((repository) => repository.projectId)
                      .map((repository) => repository.projectId)
                  ).size
                }
              </strong>
            </article>
          </section>

          <section className="github-installation-list">
            {status.installations.map((installation) => {
              const health = statusCopy(installation);
              const HealthIcon = health.icon;
              const isSuspended = health.tone === "suspended";
              return (
                <article className={`github-installation ${health.tone}`} key={installation.id}>
                  <header>
                    <Github size={24} />
                    <div>
                      <span>{installation.accountType}</span>
                      <h2>{installation.accountLogin}</h2>
                    </div>
                    <b>
                      {installation.selectedRepositoryCount} / {installation.repositoryCount}{" "}
                      selected
                    </b>
                  </header>
                  <div className="github-installation-health">
                    <HealthIcon className={health.tone === "syncing" ? "spin" : ""} size={19} />
                    <span>
                      <strong>{health.label}</strong>
                      <small>{health.copy}</small>
                    </span>
                  </div>
                  <footer>
                    <span>
                      <LockKeyhole size={14} /> Repository access:{" "}
                      {installation.repositorySelection}
                    </span>
                    {installation.manageUrl ? (
                      <a href={installation.manageUrl} rel="noreferrer" target="_blank">
                        Manage on GitHub <ArrowUpRight size={13} />
                      </a>
                    ) : null}
                    <button
                      className="button secondary"
                      disabled={isSuspended || busyKey === `sync-${installation.id}`}
                      type="button"
                      onClick={() => void sync(installation)}
                    >
                      <RefreshCw
                        className={busyKey === `sync-${installation.id}` ? "spin" : ""}
                        size={14}
                      />{" "}
                      Refresh repositories
                    </button>
                  </footer>
                </article>
              );
            })}
          </section>

          <section className="github-repository-register" aria-label="GitHub repositories">
            <header>
              <div>
                <span className="overline">Repository access</span>
                <h2>Assign repositories to projects</h2>
              </div>
              <p>Only selected repositories contribute development data to WorkflowHQ.</p>
            </header>
            {repositories.length === 0 ? (
              <div className="github-repository-empty">
                <Unplug size={26} />
                <p>
                  No repositories have been imported yet. Refresh an installation after granting
                  repository access on GitHub.
                </p>
              </div>
            ) : (
              repositories.map((repository) => {
                const busy = busyKey === `repository-${repository.id}`;
                return (
                  <article
                    className={`github-repository-row${repository.selected ? " selected" : ""}`}
                    key={repository.id}
                  >
                    <div className="github-repository-name">
                      <Github size={17} />
                      <span>
                        <a href={repository.htmlUrl} rel="noreferrer" target="_blank">
                          {repository.fullName}
                        </a>
                        <small>
                          {repository.isPrivate ? "Private" : "Public"} · default branch{" "}
                          {repository.defaultBranch}
                          {repository.isArchived ? " · archived" : ""}
                        </small>
                      </span>
                    </div>
                    <label>
                      WorkflowHQ project
                      <select
                        aria-label={`Project for ${repository.fullName}`}
                        disabled={busy || repository.isArchived}
                        value={projectDrafts[repository.id] || ""}
                        onChange={(event) =>
                          setProjectDrafts((current) => ({
                            ...current,
                            [repository.id]: event.target.value
                          }))
                        }
                      >
                        <option value="">Choose a project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.key} — {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className={`github-repository-state ${repository.syncState}`}>
                      {repository.lastError ||
                        (repository.selected
                          ? `Linked to ${repository.projectKey || "project"}`
                          : "Not selected")}
                    </span>
                    <div className="github-repository-actions">
                      {repository.selected ? (
                        <button
                          className="button secondary"
                          disabled={busy}
                          type="button"
                          onClick={() => void saveRepository(repository, false)}
                        >
                          Remove
                        </button>
                      ) : null}
                      <button
                        className="button primary"
                        disabled={busy || repository.isArchived || !projectDrafts[repository.id]}
                        type="button"
                        onClick={() => void saveRepository(repository, true)}
                      >
                        {busy
                          ? "Saving…"
                          : repository.selected
                            ? "Save assignment"
                            : "Select repository"}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </section>
          <GitHubOperationsPanels
            busyKey={busyKey}
            failures={webhookFailures}
            identityDirectory={identityDirectory}
            identityDrafts={identityDrafts}
            onIdentityDraft={(actor, userId) =>
              setIdentityDrafts((current) => ({ ...current, [identityKey(actor)]: userId }))
            }
            onMapIdentity={(actor) => void saveIdentity(actor)}
            onRemoveIdentity={(actor) => void removeIdentity(actor)}
            onRetryDelivery={(delivery) => void retryDelivery(delivery)}
          />
        </>
      )}
    </main>
  );
}

export default GitHubIntegration;
