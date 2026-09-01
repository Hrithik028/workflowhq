import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  GitCommitHorizontal,
  Github,
  GitPullRequest,
  Rocket,
  ShieldAlert
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { githubApi } from "../api/github";
import type { LayoutContext } from "../components/AppLayout";
import type {
  GitHubDevelopmentEvent,
  ProjectDevelopment as ProjectDevelopmentData
} from "../types";
import { formatRelativeTime } from "../utils/format";

const eventIcon = (event: GitHubDevelopmentEvent) => {
  if (event.type === "commit") return GitCommitHorizontal;
  if (event.type === "pull_request") return GitPullRequest;
  if (event.type === "deployment" || event.type === "release") return Rocket;
  if (["failure", "failed", "timed_out", "cancelled"].includes(event.state || "")) {
    return ShieldAlert;
  }
  if (event.type === "check_run") return CheckCircle2;
  return CircleDot;
};

const eventLabel = (event: GitHubDevelopmentEvent) =>
  event.type.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function ProjectDevelopment() {
  const { id } = useParams();
  const { isDemo } = useOutletContext<LayoutContext>();
  const projectId = Number(id);
  const [data, setData] = useState<ProjectDevelopmentData | null>(null);
  const [isLoading, setIsLoading] = useState(!isDemo);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (isDemo || !Number.isSafeInteger(projectId) || projectId <= 0) return;
    setIsLoading(true);
    try {
      setData(await githubApi.getProjectDevelopment(projectId));
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load this project's development history."));
    } finally {
      setIsLoading(false);
    }
  }, [isDemo, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const linksByEvent = useMemo(() => {
    const links = new Map<number, ProjectDevelopmentData["taskLinks"]>();
    for (const link of data?.taskLinks || []) {
      links.set(link.eventId, [...(links.get(link.eventId) || []), link]);
    }
    return links;
  }, [data]);

  if (isDemo) {
    return (
      <main className="workspace-page project-development-page">
        <header className="engineering-page-header">
          <div>
            <span className="overline">Projects / Development</span>
            <h1>Verified development history</h1>
            <p>Live repository data is unavailable in preview mode.</p>
          </div>
          <Link className="button secondary" to="/projects">
            <ArrowLeft size={16} /> Projects
          </Link>
        </header>
      </main>
    );
  }

  return (
    <main className="workspace-page project-development-page" aria-busy={isLoading}>
      <header className="engineering-page-header project-development-header">
        <div>
          <span className="overline">Projects / Verified development</span>
          <h1>{data?.project.name || "Project development"}</h1>
          <p>
            {data?.project.key || "Project"} · commits, pull requests, checks, deployments, and
            releases received from GitHub.
          </p>
        </div>
        <div className="project-development-header-actions">
          <Link className="button secondary" to="/projects">
            <ArrowLeft size={16} /> Projects
          </Link>
          <Link className="button primary" to="/settings/integrations/github">
            <Github size={16} /> GitHub settings
          </Link>
        </div>
      </header>

      {error ? <p className="form-alert error">{error}</p> : null}
      {isLoading ? <p className="register-loading">Loading verified GitHub history…</p> : null}

      {data ? (
        <>
          <section className="project-development-metrics" aria-label="Project development metrics">
            <article>
              <span>Repositories</span>
              <strong>{data.repositories.length}</strong>
            </article>
            <article>
              <span>Open pull requests</span>
              <strong>
                {
                  data.events.filter(
                    (event) => event.type === "pull_request" && event.state === "open"
                  ).length
                }
              </strong>
            </article>
            <article>
              <span>Failing checks</span>
              <strong>
                {
                  data.events.filter(
                    (event) =>
                      event.type === "check_run" &&
                      ["failure", "failed", "timed_out", "cancelled"].includes(event.state || "")
                  ).length
                }
              </strong>
            </article>
            <article>
              <span>Linked tickets</span>
              <strong>{new Set(data.taskLinks.map((link) => link.taskId)).size}</strong>
            </article>
          </section>

          <section className="project-repository-strip" aria-label="Connected repositories">
            <header>
              <span className="overline">Connected repositories</span>
              <b>{data.repositories.length}</b>
            </header>
            {data.repositories.length ? (
              data.repositories.map((repository) => (
                <a href={repository.htmlUrl} key={repository.id} rel="noreferrer" target="_blank">
                  <Github size={17} />
                  <span>
                    <strong>{repository.fullName}</strong>
                    <small>
                      {repository.isPrivate ? "Private" : "Public"} · {repository.defaultBranch} ·{" "}
                      {repository.syncState}
                    </small>
                  </span>
                  <ArrowUpRight size={15} />
                </a>
              ))
            ) : (
              <p>
                No repository is assigned to this project. Connect one in GitHub settings to start
                tracking development.
              </p>
            )}
          </section>

          <section className="project-development-feed" aria-label="Verified development events">
            <header>
              <div>
                <span className="overline">Verified event stream</span>
                <h2>Development history</h2>
              </div>
              <b>{data.events.length} events</b>
            </header>
            {data.events.length ? (
              data.events.map((event) => {
                const EventIcon = eventIcon(event);
                const taskLinks = linksByEvent.get(event.id) || [];
                return (
                  <article key={event.id}>
                    <span className={`project-development-event-icon ${event.type}`}>
                      <EventIcon size={18} />
                    </span>
                    <div className="project-development-event-copy">
                      <span>
                        {eventLabel(event)} · {event.repositoryFullName}
                      </span>
                      <a href={event.url} rel="noreferrer" target="_blank">
                        {event.title} <ArrowUpRight size={12} />
                      </a>
                      <small>
                        {event.actorLogin || "GitHub"} · {formatRelativeTime(event.occurredAt)}
                        {event.state ? ` · ${event.state}` : ""}
                      </small>
                    </div>
                    <div className="project-development-ticket-links">
                      {taskLinks.length ? (
                        taskLinks.map((link) => (
                          <Link key={link.taskId} to={`/tasks/${link.taskId}`}>
                            {link.issueKey}
                            <small>{link.linkSource}</small>
                          </Link>
                        ))
                      ) : (
                        <span>No ticket key matched</span>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="github-repository-empty">
                <Github size={26} />
                <p>No verified GitHub events have been synchronized for this project yet.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

export default ProjectDevelopment;
