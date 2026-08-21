import { ArrowRight, CheckCircle2, FolderKanban, Plus } from "lucide-react";
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

  return (
    <main className="workspace-page projects-page">
      <header className="workspace-header">
        <div>
          <span className="overline">Portfolio view</span>
          <h1>Projects</h1>
          <p>Keep outcomes, progress, and the work behind them connected.</p>
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
      {isLoading ? (
        <div className="project-grid loading">
          <span />
          <span />
          <span />
        </div>
      ) : null}
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
      <section className="project-grid">
        {projects.map((project, index) => {
          const percent = project.taskCount
            ? Math.round((project.completedCount / project.taskCount) * 100)
            : 0;
          return (
            <article className="project-card" key={project.id}>
              <header>
                <span className={`project-symbol tone-${(index % 3) + 1}`}>
                  <FolderKanban size={19} />
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(project);
                    setIsModalOpen(true);
                  }}
                >
                  Edit
                </button>
              </header>
              <h2>{project.name}</h2>
              <p>{project.description || "No description yet."}</p>
              <div className="project-progress-label">
                <span>
                  {project.completedCount} of {project.taskCount} complete
                </span>
                <strong>{percent}%</strong>
              </div>
              <div className="progress-track">
                <span style={{ width: `${percent}%` }} />
              </div>
              <footer>
                <span>
                  <CheckCircle2 size={15} /> {project.completedCount} completed
                </span>
                <Link to={`/app?project=${project.id}`}>
                  Open board <ArrowRight size={15} />
                </Link>
              </footer>
            </article>
          );
        })}
      </section>

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
