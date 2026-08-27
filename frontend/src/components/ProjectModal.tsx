import { LogOut, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { getErrorMessage } from "../api/client";
import type { Project, ProjectInput, ProjectMember, ProjectRole, WorkspaceClient } from "../types";

interface ProjectModalProps {
  client: WorkspaceClient;
  currentUserId: number;
  isSaving: boolean;
  onClose: () => void;
  onDelete?: (project: Project) => Promise<void>;
  onSave: (input: ProjectInput) => Promise<void>;
  project?: Project | null;
}

const roleLabel: Record<ProjectRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer"
};

function ProjectModal({
  client,
  currentUserId,
  isSaving,
  onClose,
  onDelete,
  onSave,
  project
}: ProjectModalProps) {
  const [form, setForm] = useState<ProjectInput>(() =>
    project
      ? { key: project.key, name: project.name, description: project.description }
      : { key: "", name: "", description: "" }
  );
  const [error, setError] = useState("");
  const isKeyLocked = Boolean(project && project.taskCount > 0);
  const isOwner = project ? project.myRole === "owner" : true;
  const isReadOnlyFields = Boolean(project) && !isOwner;

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [isMemberBusy, setIsMemberBusy] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"editor" | "viewer">("editor");

  const loadMembers = useCallback(async () => {
    if (!project) return;
    setIsLoadingMembers(true);
    try {
      setMembers(await client.listMembers(project.id));
      setMemberError("");
    } catch (loadError) {
      setMemberError(getErrorMessage(loadError, "Unable to load project members."));
    } finally {
      setIsLoadingMembers(false);
    }
  }, [client, project]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadMembers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMembers]);

  const ownerCount = members.filter((member) => member.role === "owner").length;
  const isSoleOwner = isOwner && ownerCount <= 1;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isReadOnlyFields) return;
    if (!form.name.trim()) return setError("Give the project a clear name.");
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(form.key)) {
      return setError("Use a 2–10 character key starting with a letter.");
    }
    await onSave({
      key: form.key,
      name: form.name.trim(),
      description: form.description.trim()
    });
  };

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || !addEmail.trim()) return;
    setIsMemberBusy(true);
    try {
      await client.addMember(project.id, { email: addEmail.trim(), role: addRole });
      setAddEmail("");
      setAddRole("editor");
      await loadMembers();
      setMemberError("");
    } catch (addError) {
      setMemberError(getErrorMessage(addError, "Unable to add this member."));
    } finally {
      setIsMemberBusy(false);
    }
  };

  const changeRole = async (member: ProjectMember, role: ProjectRole) => {
    if (!project) return;
    setIsMemberBusy(true);
    try {
      await client.updateMemberRole(project.id, member.userId, role);
      await loadMembers();
      setMemberError("");
    } catch (roleError) {
      setMemberError(getErrorMessage(roleError, "Unable to change this member's role."));
    } finally {
      setIsMemberBusy(false);
    }
  };

  const removeMember = async (member: ProjectMember) => {
    if (!project) return;
    setIsMemberBusy(true);
    try {
      await client.removeMember(project.id, member.userId);
      await loadMembers();
      setMemberError("");
    } catch (removeError) {
      setMemberError(getErrorMessage(removeError, "Unable to remove this member."));
    } finally {
      setIsMemberBusy(false);
    }
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
            <span>Project key</span>
            <input
              aria-describedby="project-key-help"
              autoFocus={!project}
              disabled={isKeyLocked || isReadOnlyFields}
              inputMode="text"
              maxLength={10}
              onChange={(event) =>
                setForm({
                  ...form,
                  key: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                })
              }
              placeholder="e.g. LAUNCH"
              required
              value={form.key}
            />
            <small className="field-help" id="project-key-help">
              {isReadOnlyFields
                ? "Only a project owner can rename or re-key this project."
                : isKeyLocked
                  ? "Locked because this project already has tickets. Existing issue keys stay permanent."
                  : "2–10 letters or numbers. This prefix creates permanent keys such as LAUNCH-42."}
            </small>
          </label>
          <label>
            <span>Project name</span>
            <input
              autoFocus={Boolean(project)}
              disabled={isReadOnlyFields}
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
              disabled={isReadOnlyFields}
              maxLength={1000}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="What outcome is this project driving?"
              rows={4}
              value={form.description}
            />
          </label>
          {error ? <p className="form-alert error">{error}</p> : null}
          <footer className="modal-actions">
            {project && onDelete && isOwner ? (
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
                {isReadOnlyFields ? "Close" : "Cancel"}
              </button>
              {!isReadOnlyFields ? (
                <button className="button primary" disabled={isSaving} type="submit">
                  {isSaving ? "Saving…" : project ? "Save changes" : "Create project"}
                </button>
              ) : null}
            </div>
          </footer>
        </form>

        {project ? (
          <section className="member-section">
            <header className="member-section-header">
              <span className="overline">Members</span>
              {!isOwner ? <small>Read only — ask an owner to make changes.</small> : null}
            </header>
            {memberError ? <p className="form-alert error">{memberError}</p> : null}
            {isLoadingMembers ? <p className="register-loading">Loading members…</p> : null}
            <ul className="member-list">
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;
                return (
                  <li className="member-row" key={member.userId}>
                    <div className="member-identity">
                      <strong>
                        {member.name} {isSelf ? <em>(you)</em> : null}
                      </strong>
                      <span>{member.email}</span>
                    </div>
                    {isOwner && !isSelf ? (
                      <select
                        aria-label={`Change role for ${member.name}`}
                        disabled={isMemberBusy}
                        onChange={(event) => void changeRole(member, event.target.value as ProjectRole)}
                        value={member.role}
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className={`member-role-badge ${member.role}`}>
                        {roleLabel[member.role]}
                      </span>
                    )}
                    {isOwner && !isSelf ? (
                      <button
                        aria-label={`Remove ${member.name}`}
                        className="icon-button"
                        disabled={isMemberBusy}
                        onClick={() => void removeMember(member)}
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                    {isSelf && !isSoleOwner ? (
                      <button
                        aria-label="Leave project"
                        className="icon-button"
                        disabled={isMemberBusy}
                        onClick={() => {
                          if (window.confirm("Leave this project?")) void removeMember(member);
                        }}
                        type="button"
                      >
                        <LogOut size={15} />
                      </button>
                    ) : null}
                  </li>
                );
              })}
              {!isLoadingMembers && !members.length ? <p>No members yet.</p> : null}
            </ul>

            {isOwner ? (
              <form className="member-add-row" onSubmit={addMember}>
                <input
                  aria-label="Add member by email"
                  disabled={isMemberBusy}
                  onChange={(event) => setAddEmail(event.target.value)}
                  placeholder="teammate@company.com"
                  type="email"
                  value={addEmail}
                />
                <select
                  aria-label="New member role"
                  disabled={isMemberBusy}
                  onChange={(event) => setAddRole(event.target.value as "editor" | "viewer")}
                  value={addRole}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  className="button secondary"
                  disabled={isMemberBusy || !addEmail.trim()}
                  type="submit"
                >
                  <UserPlus size={15} /> Add
                </button>
              </form>
            ) : null}
          </section>
        ) : null}
      </section>
    </div>
  );
}

export default ProjectModal;
