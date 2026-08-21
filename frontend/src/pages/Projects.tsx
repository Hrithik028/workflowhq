import { ArrowUpRight, FolderKanban, PencilLine, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import ProjectModal from "../components/ProjectModal";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, ProjectInput } from "../types";

function Projects() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      setProjects(await client.listProjects());
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load projects."));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    client
      .listProjects()
      .then((data) => {
        if (active) setProjects(data);
      })
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError, "Unable to load projects."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const saveProject = async (input: ProjectInput) => {
    setIsSaving(true);
    try {
      if (editing) await client.updateProject(editing.id, input);
      else await client.createProject(input);
      setIsModalOpen(false);
      setEditing(null);
      await loadProjects();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save the project."));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProject = async (project: Project) => {
    setIsSaving(true);
    try {
      await client.deleteProject(project.id);
      setIsModalOpen(false);
      setEditing(null);
      await loadProjects();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete the project."));
    } finally {
      setIsSaving(false);
    }
  };

  const totalTasks = projects.reduce((sum, project) => sum + project.taskCount, 0);
  const completedTasks = projects.reduce((sum, project) => sum + project.completedCount, 0);
  const activeProjects = projects.filter(
    (project) => project.taskCount === 0 || project.completedCount < project.taskCount
  ).length;
  const overallProgress = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <main className="workspace-page projects-page editorial-page">
      <header className="workspace-header editorial-page-header">
        <div>
          <span className="overline">Workflow / project index</span>
          <h1>Project register.</h1>
          <p>Define each outcome, group the work, and track progress without losing the signal.</p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => {
            setEditing(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={17} /> New project
        </button>
      </header>

      {error ? <p className="form-alert error">{error}</p> : null}

      <section className="project-register-summary" aria-label="Project portfolio summary">
        <div>
          <span>Projects</span>
          <strong>{projects.length}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{activeProjects}</strong>
        </div>
        <div>
          <span>Tasks shipped</span>
          <strong>
            {completedTasks}
            <small>/{totalTasks}</small>
          </strong>
        </div>
        <div className="signal">
          <span>Portfolio progress</span>
          <strong>{overallProgress}%</strong>
        </div>
      </section>

      {isLoading ? <p className="register-loading">Updating project register…</p> : null}
      {!isLoading && projects.length === 0 ? (
        <div className="workspace-empty">
          <FolderKanban size={28} />
          <h3>Create your first project</h3>
          <p>Projects group related tasks around a clear outcome.</p>
          <button className="button primary" type="button" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} /> New project
          </button>
        </div>
      ) : null}

      {projects.length > 0 ? (
        <section className="project-register" aria-label="Projects">
          <header className="project-register-head" aria-hidden="true">
            <span>Ref.</span>
            <span>Project / outcome</span>
            <span>Delivery</span>
            <span>State</span>
            <span>Board</span>
            <span>Edit</span>
          </header>
          {projects.map((project, index) => {
            const percent = project.taskCount
              ? Math.round((project.completedCount / project.taskCount) * 100)
              : 0;
            const state =
              project.taskCount === 0 ? "Planning" : percent === 100 ? "Shipped" : "Active";
            return (
              <article className="project-register-row" key={project.id}>
                <span className="project-reference">PRJ-{String(index + 1).padStart(3, "0")}</span>
                <div className="project-register-name">
                  <strong>{project.name}</strong>
                  <span>{project.description || "Outcome not defined yet."}</span>
                </div>
                <div className="project-register-progress">
                  <div>
                    <span>
                      {project.completedCount}/{project.taskCount} tasks
                    </span>
                    <strong>{percent}%</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <span className={`project-register-state ${state.toLowerCase()}`}>{state}</span>
                <Link
                  className="project-register-open"
                  to={`/app?project=${project.id}`}
                  aria-label={`Open ${project.name} board`}
                >
                  <span>Open</span>
                  <ArrowUpRight size={16} />
                </Link>
                <button
                  className="project-register-edit"
                  type="button"
                  aria-label={`Edit ${project.name}`}
                  onClick={() => {
                    setEditing(project);
                    setIsModalOpen(true);
                  }}
                >
                  <PencilLine size={15} />
                </button>
              </article>
            );
          })}
        </section>
      ) : null}

      {isModalOpen ? (
        <ProjectModal
          isSaving={isSaving}
          onClose={() => {
            setIsModalOpen(false);
            setEditing(null);
          }}
          onDelete={deleteProject}
          onSave={saveProject}
          project={editing}
        />
      ) : null}
    </main>
  );
}

export default Projects;
