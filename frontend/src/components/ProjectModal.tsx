import { Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { Project, ProjectInput } from "../types";

interface ProjectModalProps {
  isSaving: boolean;
  onClose: () => void;
  onDelete?: (project: Project) => Promise<void>;
  onSave: (input: ProjectInput) => Promise<void>;
  project?: Project | null;
}

function ProjectModal({ isSaving, onClose, onDelete, onSave, project }: ProjectModalProps) {
  const [form, setForm] = useState<ProjectInput>(() =>
    project
      ? { name: project.name, description: project.description }
      : { name: "", description: "" }
  );
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Give the project a clear name.");
    await onSave({ name: form.name.trim(), description: form.description.trim() });
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        <header className="modal-header">
          <div>
            <span className="overline">Project setup</span>
            <h2 id="project-modal-title">{project ? "Edit project" : "Create a project"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>
        <form className="modal-form" onSubmit={submit}>
          <label>
            <span>Project name</span>
            <input
              autoFocus
              maxLength={120}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Product launch"
              value={form.name}
            />
          </label>
          <label>
            <span>
              Description <small>Optional</small>
            </span>
            <textarea
              maxLength={1000}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What outcome is this project driving?"
              rows={4}
              value={form.description}
            />
          </label>
          {error ? <p className="form-alert error">{error}</p> : null}
          <footer className="modal-actions">
            {project && onDelete ? (
              <button
                className="button danger ghost"
                disabled={isSaving}
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete “${project.name}”? Tasks will move to Inbox.`))
                    void onDelete(project);
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
            ) : (
              <span />
            )}
            <div>
              <button
                className="button secondary"
                disabled={isSaving}
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button className="button primary" disabled={isSaving} type="submit">
                {isSaving ? "Saving…" : project ? "Save changes" : "Create project"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default ProjectModal;
