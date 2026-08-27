import {
  Check,
  CheckCircle2,
  Circle,
  GitBranch,
  Github,
  GitPullRequest,
  MoreHorizontal,
  Rocket,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import TaskModal from "../components/TaskModal";
import { engineeringMetaFor, issueTypeLabel } from "../demo/engineeringMeta";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Task, TaskInput } from "../types";
import { statusLabel } from "../utils/format";

const criteriaFor = (task: Task) => [
  `Complete ${task.title.toLowerCase()} for the agreed delivery scope`,
  "Add automated coverage for the main success and failure paths",
  "Pass required CI checks before the change is merged",
  "Update the engineering notes and release handoff"
];

function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDemo, user } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult] = await Promise.all([
        client.listTasks({ limit: 100 }),
        client.listProjects()
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load this issue."));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const task = tasks.find((item) => item.id === Number(id));
  const parent = task?.parentId ? tasks.find((item) => item.id === task.parentId) : null;
  const children = task ? tasks.filter((item) => item.parentId === task.id) : [];
  const meta = task ? engineeringMetaFor(task) : null;

  const saveTask = async (input: TaskInput) => {
    if (!task) return;
    setIsSaving(true);
    try {
      await client.updateTask(task.id, input);
      setIsModalOpen(false);
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to update this issue."));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async (target: Task) => {
    setIsSaving(true);
    try {
      await client.deleteTask(target.id);
      navigate("/tasks");
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete this issue."));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !task)
    return (
      <main className="workspace-page task-detail-page">
        <p className="register-loading">Loading issue…</p>
      </main>
    );
  if (!task || !meta)
    return (
      <main className="workspace-page task-detail-page">
        <div className="workspace-empty">
          <h1>Issue not found.</h1>
          <Link className="button secondary" to="/tasks">
            Return to hierarchy
          </Link>
        </div>
      </main>
    );

  return (
    <main className="workspace-page task-detail-page">
      {error ? <p className="form-alert error">{error}</p> : null}
      <section className="task-detail-grid">
        <div className="task-detail-main">
          <header className="task-detail-header">
            <span className="overline">{task.projectName || "Inbox"} / Track development</span>
            <span className="task-detail-key">{task.issueKey}</span>
            <div>
              <h1>{task.title}</h1>
              <span className="task-kind">{issueTypeLabel(task)}</span>
              <span className={`task-detail-status ${task.status}`}>
                {statusLabel[task.status]}
              </span>
            </div>
          </header>

          <section className="task-copy-block">
            <h2>Description</h2>
            <p>
              {task.description ||
                "Add a clear description of the engineering outcome and expected behavior."}
            </p>
          </section>
          <section className="task-copy-block">
            <h2>Acceptance criteria</h2>
            <ul className="acceptance-list">
              {criteriaFor(task).map((criterion, index) => (
                <li key={criterion}>
                  <span
                    className={
                      index <
                      (task.status === "completed" ? 4 : task.status === "in_progress" ? 2 : 1)
                        ? "checked"
                        : ""
                    }
                  >
                    {index <
                    (task.status === "completed" ? 4 : task.status === "in_progress" ? 2 : 1) ? (
                      <Check size={14} />
                    ) : null}
                  </span>
                  {criterion}
                </li>
              ))}
            </ul>
          </section>

          <section className="task-relations">
            <div>
              <h2>Parent task</h2>
              {parent ? (
                <Link to={`/tasks/${parent.id}`}>
                  <span>▧</span>
                  <b>{parent.issueKey}</b>
                  {parent.title}
                  <em>{statusLabel[parent.status]}</em>
                </Link>
              ) : (
                <p>No parent issue.</p>
              )}
            </div>
            <div>
              <h2>Child tasks</h2>
              {children.length ? (
                children.map((child) => (
                  <Link key={child.id} to={`/tasks/${child.id}`}>
                    <span>▧</span>
                    <b>{child.issueKey}</b>
                    {child.title}
                    <em>{statusLabel[child.status]}</em>
                  </Link>
                ))
              ) : (
                <p>No child issues yet.</p>
              )}
            </div>
          </section>

          <section className="task-activity">
            <h2>Activity</h2>
            <article>
              <i>{meta.initials}</i>
              <div>
                <strong>{meta.assignee}</strong>
                <time>2 hours ago</time>
                <p>
                  Pushed <b>{meta.commit}</b> and added implementation coverage. Ready for review.
                </p>
              </div>
            </article>
            <article>
              <i>
                {meta.reviewer
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </i>
              <div>
                <strong>{meta.reviewer}</strong>
                <time>45 minutes ago</time>
                <p>
                  Reviewed the change. The implementation looks solid; one follow-up is still open.
                </p>
              </div>
            </article>
            <article>
              <i>{meta.initials}</i>
              <div>
                <strong>{meta.assignee}</strong>
                <time>10 minutes ago</time>
                <p>Addressed review feedback and updated the checks.</p>
              </div>
            </article>
            <div className="task-comment">
              <i>{user.name.charAt(0)}</i>
              <input aria-label="Add a comment" placeholder="Add a comment..." />
              <button type="button">Comment</button>
            </div>
          </section>
        </div>

        <aside className="development-panel">
          <header>
            <h2>Development</h2>
            <button type="button" aria-label="More development actions">
              <MoreHorizontal size={18} />
            </button>
            <button className="button primary" type="button" onClick={() => setIsModalOpen(true)}>
              Edit task
            </button>
          </header>
          <section>
            <h3>Repository</h3>
            <a href="https://github.com/Hrithik028/workflowhq" rel="noreferrer" target="_blank">
              <Github size={18} /> Hrithik028/workflowhq
            </a>
          </section>
          <section>
            <h3>Branch</h3>
            <span className="development-link">
              <GitBranch size={17} /> {meta.branch}
            </span>
          </section>
          <section>
            <h3>Commits (4)</h3>
            {[
              "Add the primary implementation",
              "Add unit tests for valid and invalid paths",
              "Handle the missing configuration path",
              "Initial implementation"
            ].map((copy, index) => (
              <p className="commit-row" key={copy}>
                <a href="https://github.com/Hrithik028/workflowhq" rel="noreferrer" target="_blank">
                  {(Number.parseInt(meta.commit, 16) + index * 173)
                    .toString(16)
                    .padStart(7, "0")
                    .slice(-7)}
                </a>
                <span>{copy}</span>
                <time>{index + 2}h ago</time>
              </p>
            ))}
          </section>
          <section>
            <h3>Pull request</h3>
            <a
              className="development-link"
              href="https://github.com/Hrithik028/workflowhq/pulls"
              rel="noreferrer"
              target="_blank"
            >
              #{meta.pullRequest}&nbsp;&nbsp; {task.title}
            </a>
            <p>
              Opened by <b>{meta.assignee}</b>&nbsp;&nbsp;·&nbsp;&nbsp;2 hours ago
            </p>
            <p>
              Reviewers&nbsp;&nbsp; <b>{meta.reviewer}</b>
            </p>
          </section>
          <section>
            <h3>Review status</h3>
            <p className="review-status">
              <span /> Changes requested{" "}
              <b>
                1 of 1&nbsp;&nbsp;
                {meta.reviewer
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </b>
            </p>
          </section>
          <section>
            <h3>Checks</h3>
            <p className="checks-status">
              <CheckCircle2 size={17} /> {meta.checksPassed} passed&nbsp;&nbsp;·&nbsp;&nbsp;
              <b>{meta.checksRunning || 1} running</b>
              <a
                href="https://github.com/Hrithik028/workflowhq/actions"
                rel="noreferrer"
                target="_blank"
              >
                View details
              </a>
            </p>
          </section>
          <section>
            <h3>Deployment</h3>
            <p className="deployment-status">
              <Rocket size={17} />{" "}
              {meta.environment.charAt(0).toUpperCase() + meta.environment.slice(1)} successful{" "}
              <time>2 hours ago</time>
              <a href="https://workflowhq.onrender.com" rel="noreferrer" target="_blank">
                View deployment
              </a>
            </p>
          </section>
        </aside>
      </section>

      <section className="development-timeline">
        <h2>Activity timeline</h2>
        <div>
          <article>
            <i>
              <GitBranch />
            </i>
            <strong>Push</strong>
            <span>{meta.commit}</span>
            <small>2 hours ago</small>
          </article>
          <article>
            <i>
              <GitPullRequest />
            </i>
            <strong>Pull request created</strong>
            <span>#{meta.pullRequest} opened</span>
            <small>2 hours ago</small>
          </article>
          <article>
            <i>
              <Circle />
            </i>
            <strong>CI checks</strong>
            <span>
              {meta.checksPassed} passed · {meta.checksRunning || 1} running
            </span>
            <small>1 hour ago</small>
          </article>
          <article>
            <i>
              <UserRound />
            </i>
            <strong>Awaiting review</strong>
            <span>Changes requested</span>
            <small>45 minutes ago</small>
          </article>
        </div>
      </section>

      {isModalOpen ? (
        <TaskModal
          isSaving={isSaving}
          onClose={() => setIsModalOpen(false)}
          onDelete={deleteTask}
          onSave={saveTask}
          projects={projects}
          task={task}
          tasks={tasks}
        />
      ) : null}
    </main>
  );
}

export default TaskDetail;
