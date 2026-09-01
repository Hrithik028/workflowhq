import {
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  GitBranch,
  Github,
  GitPullRequest,
  MoreHorizontal,
  Pencil,
  Rocket,
  Trash2,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { githubApi } from "../api/github";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import LabelPill from "../components/LabelPill";
import PriorityIcon from "../components/PriorityIcon";
import TaskModal from "../components/TaskModal";
import { engineeringMetaFor, issueTypeLabel } from "../demo/engineeringMeta";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Comment, DevelopmentLink, Project, Task, TaskInput } from "../types";
import { formatDate, formatRelativeTime, initialsFor, statusLabel } from "../utils/format";

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [isCommentBusy, setIsCommentBusy] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [developmentLinks, setDevelopmentLinks] = useState<DevelopmentLink[]>([]);
  const [isDevelopmentLoading, setIsDevelopmentLoading] = useState(false);
  const [developmentError, setDevelopmentError] = useState("");

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
  const isOverdue = Boolean(
    task &&
    task.dueDate &&
    task.dueDate < new Date().toISOString().slice(0, 10) &&
    task.status !== "completed"
  );
  const currentProject = task ? projects.find((item) => item.id === task.projectId) : null;
  const canModerateComments =
    currentProject?.myRole === "owner" || currentProject?.myRole === "editor";

  const loadComments = useCallback(
    async (taskId: number) => {
      try {
        setComments(await client.listComments(taskId));
      } catch (commentError) {
        setError(getErrorMessage(commentError, "Unable to load comments."));
      }
    },
    [client]
  );

  const taskId = task?.id ?? null;

  useEffect(() => {
    if (taskId == null) return;
    const timer = window.setTimeout(() => void loadComments(taskId), 0);
    return () => window.clearTimeout(timer);
  }, [taskId, loadComments]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (taskId == null || isDemo) {
        setDevelopmentLinks([]);
        setDevelopmentError("");
        setIsDevelopmentLoading(false);
        return;
      }
      setIsDevelopmentLoading(true);
      githubApi
        .getTaskDevelopment(taskId)
        .then((development) => {
          if (!active) return;
          setDevelopmentLinks(development.links);
          setDevelopmentError("");
        })
        .catch((developmentLoadError: unknown) => {
          if (!active) return;
          setDevelopmentLinks([]);
          setDevelopmentError(
            getErrorMessage(developmentLoadError, "Unable to load verified GitHub activity.")
          );
        })
        .finally(() => {
          if (active) setIsDevelopmentLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isDemo, taskId]);

  const postComment = async () => {
    if (!task || !commentBody.trim()) return;
    setIsCommentBusy(true);
    try {
      const comment = await client.createComment(task.id, { body: commentBody.trim() });
      setComments((current) => [...current, comment]);
      setCommentBody("");
    } catch (commentError) {
      setError(getErrorMessage(commentError, "Unable to post that comment."));
    } finally {
      setIsCommentBusy(false);
    }
  };

  const startEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingBody(comment.body);
  };

  const saveEditedComment = async (comment: Comment) => {
    if (!task || !editingBody.trim()) return;
    setIsCommentBusy(true);
    try {
      const updated = await client.updateComment(task.id, comment.id, {
        body: editingBody.trim()
      });
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingCommentId(null);
    } catch (commentError) {
      setError(getErrorMessage(commentError, "Unable to update that comment."));
    } finally {
      setIsCommentBusy(false);
    }
  };

  const removeComment = async (comment: Comment) => {
    if (!task) return;
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    setIsCommentBusy(true);
    try {
      await client.deleteComment(task.id, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
    } catch (commentError) {
      setError(getErrorMessage(commentError, "Unable to delete that comment."));
    } finally {
      setIsCommentBusy(false);
    }
  };

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
            <span className="overline">
              {task.projectName || "Inbox"} / {isDemo ? "Sample development" : "Issue details"}
            </span>
            <span className="task-detail-key">{task.issueKey}</span>
            <div>
              <h1>{task.title}</h1>
              <span className="task-kind">{issueTypeLabel(task)}</span>
              <span className={`task-detail-status ${task.status}`}>
                {statusLabel[task.status]}
              </span>
            </div>
            <div className="task-detail-meta">
              <span className={`priority-pill ${task.priority}`}>
                <PriorityIcon priority={task.priority} />
                {task.priority}
              </span>
              <span className="task-detail-date">
                <CalendarDays size={13} /> Start {formatDate(task.startDate, "No start date")}
              </span>
              <span className={`task-detail-date${isOverdue ? " overdue" : ""}`}>
                <CalendarDays size={13} /> Due {formatDate(task.dueDate)}
              </span>
              <span className="task-detail-date">
                <UserRound size={13} /> {task.assigneeName || "Unassigned"}
              </span>
            </div>
            {task.labels.length > 0 ? (
              <div className="label-row">
                {task.labels.map((label) => (
                  <LabelPill key={label.id} label={label} />
                ))}
              </div>
            ) : null}
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
            {isDemo ? (
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
            ) : (
              <p className="truthful-empty-state">
                No acceptance criteria are stored for this issue yet. Persisted criteria editing
                will be added as ticket data.
              </p>
            )}
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
            {comments.length === 0 ? (
              <p className="task-activity-empty">
                No comments yet — this is where discussion on {task.issueKey} will show up.
              </p>
            ) : (
              <ul className="comment-list">
                {comments.map((comment) => {
                  const isAuthor = comment.userId === user.id;
                  const canEdit = isAuthor;
                  const canDelete = isAuthor || canModerateComments;
                  const isEditing = editingCommentId === comment.id;
                  return (
                    <li key={comment.id}>
                      <i>{initialsFor(comment.authorName)}</i>
                      <div>
                        <header>
                          <strong>{comment.authorName}</strong>
                          <time>{formatRelativeTime(comment.createdAt)}</time>
                          {comment.updatedAt !== comment.createdAt ? <em>Edited</em> : null}
                        </header>
                        {isEditing ? (
                          <div className="comment-edit-form">
                            <textarea
                              maxLength={2000}
                              onChange={(event) => setEditingBody(event.target.value)}
                              rows={2}
                              value={editingBody}
                            />
                            <div className="comment-edit-actions">
                              <button
                                className="button secondary"
                                disabled={isCommentBusy}
                                onClick={() => setEditingCommentId(null)}
                                type="button"
                              >
                                Cancel
                              </button>
                              <button
                                className="button primary"
                                disabled={isCommentBusy || !editingBody.trim()}
                                onClick={() => void saveEditedComment(comment)}
                                type="button"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p>{comment.body}</p>
                        )}
                      </div>
                      {!isEditing && (canEdit || canDelete) ? (
                        <div className="comment-controls">
                          {canEdit ? (
                            <button
                              aria-label="Edit comment"
                              onClick={() => startEditComment(comment)}
                              type="button"
                            >
                              <Pencil size={13} />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              aria-label="Delete comment"
                              onClick={() => void removeComment(comment)}
                              type="button"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="task-comment">
              <i>{initialsFor(user.name)}</i>
              <input
                aria-label="Add a comment"
                disabled={isCommentBusy}
                onChange={(event) => setCommentBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void postComment();
                  }
                }}
                placeholder="Add a comment…"
                value={commentBody}
              />
              <button
                disabled={isCommentBusy || !commentBody.trim()}
                onClick={() => void postComment()}
                type="button"
              >
                Comment
              </button>
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
          {isDemo ? (
            <>
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
                    <a
                      href="https://github.com/Hrithik028/workflowhq"
                      rel="noreferrer"
                      target="_blank"
                    >
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
            </>
          ) : isDevelopmentLoading ? (
            <section className="development-empty-state" aria-live="polite">
              <Github className="spin" size={28} />
              <h3>Loading verified development data…</h3>
              <p>WorkflowHQ is checking linked repositories and GitHub activity for this issue.</p>
            </section>
          ) : developmentError ? (
            <section className="development-empty-state error" role="alert">
              <Github size={28} />
              <h3>Development data unavailable</h3>
              <p>{developmentError}</p>
              <Link to="/settings/integrations/github">Check GitHub connection</Link>
            </section>
          ) : developmentLinks.length ? (
            <div className="verified-development-list">
              <section className="verified-development-summary">
                <CheckCircle2 size={19} />
                <span>
                  <strong>Verified GitHub activity</strong>
                  <small>
                    {developmentLinks.length} linked item{developmentLinks.length === 1 ? "" : "s"}
                  </small>
                </span>
              </section>
              {Object.entries(
                developmentLinks.reduce<Record<string, DevelopmentLink[]>>((groups, link) => {
                  const key = link.type;
                  groups[key] = [...(groups[key] || []), link];
                  return groups;
                }, {})
              ).map(([type, links]) => (
                <section className="verified-development-group" key={type}>
                  <h3>
                    {type.replaceAll("_", " ")} ({links.length})
                  </h3>
                  {links.map((link) => (
                    <article key={link.id}>
                      <a href={link.url} rel="noreferrer" target="_blank">
                        {link.githubNumber ? `#${link.githubNumber} ` : ""}
                        {link.title}
                      </a>
                      <span>{link.repositoryFullName}</span>
                      <small>
                        {link.actorLogin ? `${link.actorLogin} · ` : ""}
                        {link.state ? `${link.state} · ` : ""}
                        {formatRelativeTime(link.occurredAt)}
                      </small>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <section className="development-empty-state">
              <Github size={28} />
              <h3>No linked GitHub activity</h3>
              <p>
                No verified branch, commit, pull request, check, release, or deployment is linked to{" "}
                {task.issueKey} yet.
              </p>
              <Link to="/settings/integrations/github">Manage GitHub connection</Link>
            </section>
          )}
        </aside>
      </section>

      {isDemo ? (
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
      ) : null}

      {isModalOpen ? (
        <TaskModal
          client={client}
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
