import { ArrowLeft, ArrowRight, Link2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { ProjectRoadmap, ProjectWorkflow, RoadmapTask } from "../types";

const fallbackLabels = { todo: "Backlog", in_progress: "In progress", completed: "Released" };

function ProjectRoadmapPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [roadmap, setRoadmap] = useState<ProjectRoadmap | null>(null);
  const [workflow, setWorkflow] = useState<ProjectWorkflow | null>(null);
  const [blockerId, setBlockerId] = useState(0);
  const [blockedId, setBlockedId] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextRoadmap, nextWorkflow] = await Promise.all([
        client.getProjectRoadmap(projectId),
        client.getProjectWorkflow(projectId)
      ]);
      setRoadmap(nextRoadmap);
      setWorkflow(nextWorkflow);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load this project roadmap."));
    }
  }, [client, projectId]);

  useEffect(() => {
    if (!Number.isSafeInteger(projectId) || projectId <= 0) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, projectId]);

  const labels = Object.assign(
    {},
    fallbackLabels,
    ...(workflow?.statuses || []).map(({ status, label }) => ({ [status]: label }))
  );
  const tasks = roadmap?.tasks || [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const dependencies = roadmap?.dependencies || [];

  const addDependency = async () => {
    if (!blockerId || !blockedId) return;
    setIsBusy(true);
    try {
      await client.createTaskDependency(projectId, blockerId, blockedId);
      await load();
      setBlockerId(0);
      setBlockedId(0);
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to add this dependency."));
    } finally {
      setIsBusy(false);
    }
  };

  const removeDependency = async (blockerTaskId: number, blockedTaskId: number) => {
    setIsBusy(true);
    try {
      await client.deleteTaskDependency(projectId, blockerTaskId, blockedTaskId);
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to remove this dependency."));
    } finally {
      setIsBusy(false);
    }
  };

  const blockerCount = (task: RoadmapTask) =>
    dependencies.filter(
      (edge) =>
        edge.blockedTaskId === task.id && taskById.get(edge.blockerTaskId)?.status !== "completed"
    ).length;

  return (
    <main className="workspace-page project-roadmap-page" aria-busy={isBusy}>
      <header className="engineering-page-header">
        <div>
          <span className="overline">Projects / Roadmap</span>
          <h1>{roadmap?.project.name || "Project roadmap"}</h1>
          <p>See what comes next and which tickets are waiting on other work.</p>
        </div>
        <Link className="button secondary" to="/projects">
          <ArrowLeft size={16} /> Projects
        </Link>
      </header>

      {error ? (
        <p className="form-alert error" role="alert">
          {error}
        </p>
      ) : null}
      {!roadmap ? (
        <p>Loading roadmap…</p>
      ) : (
        <>
          <section className="roadmap-summary" aria-label="Roadmap summary">
            <div>
              <span>Tickets</span>
              <strong>{tasks.length}</strong>
            </div>
            <div>
              <span>Open blockers</span>
              <strong>{tasks.filter((task) => blockerCount(task) > 0).length}</strong>
            </div>
            <div>
              <span>Dependencies</span>
              <strong>{dependencies.length}</strong>
            </div>
          </section>

          <section className="roadmap-panel" aria-label="Project timeline">
            <div className="roadmap-section-heading">
              <h2>Delivery order</h2>
              <span>Due dates first · unscheduled work follows</span>
            </div>
            {tasks.length === 0 ? (
              <p>No active tickets in this project yet.</p>
            ) : (
              [...tasks]
                .sort(
                  (a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.id - b.id
                )
                .map((task) => (
                  <article className="roadmap-item" key={task.id}>
                    <div className="roadmap-date">{task.dueDate || "No due date"}</div>
                    <div className="roadmap-dot" aria-hidden="true" />
                    <div className="roadmap-item-copy">
                      <Link to={`/tasks/${task.id}`}>
                        <b>{task.issueKey}</b> {task.title}
                      </Link>
                      <span>
                        {labels[task.workflowStage || task.status]} · {task.taskType}
                        {blockerCount(task)
                          ? ` · ${blockerCount(task)} open blocker${blockerCount(task) === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </div>
                  </article>
                ))
            )}
          </section>

          <section className="roadmap-panel" aria-label="Ticket dependencies">
            <div className="roadmap-section-heading">
              <h2>Blocking relationships</h2>
              <span>
                Blocker <ArrowRight size={14} /> Waiting ticket
              </span>
            </div>
            {dependencies.length === 0 ? (
              <p>No ticket dependencies added yet.</p>
            ) : (
              dependencies.map((edge) => (
                <div
                  className="roadmap-dependency"
                  key={`${edge.blockerTaskId}-${edge.blockedTaskId}`}
                >
                  <Link to={`/tasks/${edge.blockerTaskId}`}>
                    {taskById.get(edge.blockerTaskId)?.issueKey}
                  </Link>
                  <ArrowRight size={16} aria-hidden="true" />
                  <Link to={`/tasks/${edge.blockedTaskId}`}>
                    {taskById.get(edge.blockedTaskId)?.issueKey}
                  </Link>
                  {roadmap.project.myRole !== "viewer" ? (
                    <button
                      type="button"
                      aria-label={`Remove dependency ${taskById.get(edge.blockerTaskId)?.issueKey} to ${taskById.get(edge.blockedTaskId)?.issueKey}`}
                      disabled={isBusy}
                      onClick={() => void removeDependency(edge.blockerTaskId, edge.blockedTaskId)}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              ))
            )}
            {roadmap.project.myRole !== "viewer" ? (
              <div className="roadmap-add-dependency">
                <label>
                  Blocking ticket
                  <select
                    value={blockerId}
                    onChange={(event) => setBlockerId(Number(event.target.value))}
                  >
                    <option value={0}>Choose ticket</option>
                    {tasks.map((task) => (
                      <option value={task.id} key={task.id}>
                        {task.issueKey} · {task.title}
                      </option>
                    ))}
                  </select>
                </label>
                <Link2 size={17} aria-hidden="true" />
                <label>
                  Waiting ticket
                  <select
                    value={blockedId}
                    onChange={(event) => setBlockedId(Number(event.target.value))}
                  >
                    <option value={0}>Choose ticket</option>
                    {tasks
                      .filter((task) => task.id !== blockerId)
                      .map((task) => (
                        <option value={task.id} key={task.id}>
                          {task.issueKey} · {task.title}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button primary"
                  disabled={isBusy || !blockerId || !blockedId || blockerId === blockedId}
                  onClick={() => void addDependency()}
                >
                  Add dependency
                </button>
              </div>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

export default ProjectRoadmapPage;
