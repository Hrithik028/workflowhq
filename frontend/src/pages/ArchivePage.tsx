import { Archive, FolderKanban, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import ConfirmationDialog from "../components/ConfirmationDialog";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Task } from "../types";

const archivedOn = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(value)
      )
    : "Archived";

function ArchivePage() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchArchive = useCallback(
    () =>
      Promise.all([
        client.listProjects({ archived: true }),
        client.listTasks({ archived: true, limit: 100, sort: "updated_at", order: "desc" })
      ]),
    [client]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [archivedProjects, archivedTasks] = await fetchArchive();
      setProjects(archivedProjects);
      setTasks(archivedTasks.data);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load archived work."));
    } finally {
      setIsLoading(false);
    }
  }, [fetchArchive]);

  useEffect(() => {
    let cancelled = false;

    void fetchArchive()
      .then(([archivedProjects, archivedTasks]) => {
        if (cancelled) return;
        setProjects(archivedProjects);
        setTasks(archivedTasks.data);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(getErrorMessage(loadError, "Unable to load archived work."));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchArchive]);

  const restoreProject = async (project: Project) => {
    setIsBusy(true);
    try {
      await client.restoreProject(project.id);
      await load();
    } catch (restoreError) {
      setError(getErrorMessage(restoreError, "Unable to restore this project."));
    } finally {
      setIsBusy(false);
    }
  };

  const restoreTask = async (task: Task) => {
    setIsBusy(true);
    try {
      await client.restoreTask(task.id);
      await load();
    } catch (restoreError) {
      setError(getErrorMessage(restoreError, "Unable to restore this ticket."));
    } finally {
      setIsBusy(false);
    }
  };

  const permanentlyDeleteProject = async () => {
    if (!deleteTarget) return;
    setIsBusy(true);
    try {
      await client.deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to permanently delete this project."));
    } finally {
      setIsBusy(false);
    }
  };

  const isEmpty = !isLoading && projects.length === 0 && tasks.length === 0;

  return (
    <main className="workspace-page archive-page editorial-page">
      <header className="workspace-header editorial-page-header">
        <div>
          <span className="overline">Workspace / retained work</span>
          <h1>Archive.</h1>
          <p>Remove work from active planning without losing its history or project context.</p>
        </div>
        <div className="archive-total" aria-label="Archived item count">
          <Archive size={20} />
          <strong>{projects.length + tasks.length}</strong>
          <span>retained items</span>
        </div>
      </header>

      {error ? <p className="form-alert error">{error}</p> : null}
      {isLoading ? <p className="register-loading">Opening the archive…</p> : null}
      {isEmpty ? (
        <section className="workspace-empty">
          <Archive size={30} />
          <h3>Nothing is archived</h3>
          <p>Archived projects and tickets will be retained here until you restore them.</p>
        </section>
      ) : null}

      {projects.length ? (
        <section className="archive-section" aria-labelledby="archived-projects-title">
          <header>
            <span className="overline">Project archive</span>
            <h2 id="archived-projects-title">Archived projects</h2>
            <p>The project, its tickets, and its GitHub links remain together.</p>
          </header>
          <div className="archive-list">
            {projects.map((project) => {
              const total = project.totalTaskCount ?? project.taskCount;
              return (
                <article className="archive-row" key={project.id}>
                  <span className="archive-row-icon">
                    <FolderKanban size={20} />
                  </span>
                  <div>
                    <small>{project.key}</small>
                    <h3>{project.name}</h3>
                    <p>
                      {total} retained ticket{total === 1 ? "" : "s"} ·{" "}
                      {archivedOn(project.archivedAt)}
                    </p>
                  </div>
                  <div className="archive-row-actions">
                    <button
                      className="button secondary"
                      disabled={isBusy}
                      onClick={() => void restoreProject(project)}
                      type="button"
                    >
                      <RotateCcw size={15} /> Restore
                    </button>
                    <button
                      aria-label={`Permanently delete ${project.name}`}
                      className="archive-delete"
                      disabled={isBusy || total > 0}
                      onClick={() => setDeleteTarget(project)}
                      title={
                        total > 0
                          ? "Move or remove every ticket before permanent deletion."
                          : "Permanently delete empty project"
                      }
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {tasks.length ? (
        <section className="archive-section" aria-labelledby="archived-tasks-title">
          <header>
            <span className="overline">Ticket archive</span>
            <h2 id="archived-tasks-title">Archived tickets</h2>
            <p>These tickets were archived individually; their criteria and activity are intact.</p>
          </header>
          <div className="archive-list">
            {tasks.map((task) => (
              <article className="archive-row" key={task.id}>
                <span className="archive-row-icon">
                  <Archive size={20} />
                </span>
                <div>
                  <small>{task.issueKey}</small>
                  <h3>{task.title}</h3>
                  <p>
                    {task.projectName || "Inbox"} · {archivedOn(task.archivedAt)}
                  </p>
                </div>
                <div className="archive-row-actions">
                  <button
                    className="button secondary"
                    disabled={isBusy}
                    onClick={() => void restoreTask(task)}
                    type="button"
                  >
                    <RotateCcw size={15} /> Restore
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {deleteTarget ? (
        <ConfirmationDialog
          confirmLabel="Delete permanently"
          description={`“${deleteTarget.name}” is empty. Permanent deletion removes the project and cannot be undone.`}
          isBusy={isBusy}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void permanentlyDeleteProject()}
          title="Permanently delete this project?"
          tone="danger"
        />
      ) : null}
    </main>
  );
}

export default ArchivePage;
