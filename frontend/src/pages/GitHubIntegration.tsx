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
import type {
  GitHubInstallation,
  GitHubIntegrationStatus,
  GitHubRepository,
  Project
} from "../types";
import { formatRelativeTime } from "../utils/format";
import { isAllowedGitHubInstallUrl } from "../utils/github";

const disconnectedStatus: GitHubIntegrationStatus = { connected: false, installations: [] };

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
  const [projectDrafts, setProjectDrafts] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (isDemo) {
      setStatus(disconnectedStatus);
      setRepositories([]);
      setProjects([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const nextStatus = await githubApi.getStatus();
      const [nextProjects, nextRepositories] = await Promise.all([
        workspaceApi.listProjects(),
        nextStatus.connected ? githubApi.listRepositories() : Promise.resolve([])
      ]);
      setStatus(nextStatus);
      setProjects(nextProjects);
      setRepositories(nextRepositories);
      setProjectDrafts(
        Object.fromEntries(
          nextRepositories.map((repository) => [
            repository.id,
            repository.projectId ? String(repository.projectId) : ""
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
      await githubApi.syncInstallation(installation.id);
      setStatus((current) => ({
        ...current,
        installations: current.installations.map((item) =>
          item.id === installation.id ? { ...item, syncState: "queued", lastError: null } : item
        )
      }));
      setNotice({
        tone: "success",
        text: `Repository refresh queued for ${installation.accountLogin}.`
      });
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
        <section className="github-demo-notice">
          <Github size={26} />
          <div>
            <span className="overline">Preview mode</span>
            <h2>Live GitHub connection is disabled in the demo.</h2>
            <p>
              Sample development data elsewhere in the demo is illustrative and is never presented
              as synchronized account data.
            </p>
          </div>
        </section>
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
        </>
      )}
    </main>
  );
}

export default GitHubIntegration;
