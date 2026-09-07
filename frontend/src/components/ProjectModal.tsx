import { Archive, Check, Copy, LogOut, Mail, Settings2, Trash2, UserPlus, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { getErrorMessage } from "../api/client";
import type {
  Project,
  ProjectInput,
  ProjectInvitation,
  ProjectMember,
  ProjectRole,
  WorkspaceClient
} from "../types";
import ConfirmationDialog from "./ConfirmationDialog";

interface ProjectModalProps {
  client: WorkspaceClient;
  currentUserId: number;
  isSaving: boolean;
  onClose: () => void;
  onArchive?: (project: Project) => Promise<void>;
  onOpenWorkflowSettings?: (project: Project) => void;
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
  onArchive,
  onOpenWorkflowSettings,
  onSave,
  project
}: ProjectModalProps) {
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
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
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [memberNotice, setMemberNotice] = useState("");
  const [isMemberBusy, setIsMemberBusy] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"editor" | "viewer">("editor");
  const [inviteUrl, setInviteUrl] = useState("");
  const [isInviteCopied, setIsInviteCopied] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!project) return;
    setIsLoadingMembers(true);
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        client.listMembers(project.id),
        project.myRole === "owner" ? client.listProjectInvitations(project.id) : Promise.resolve([])
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
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

  const inviteMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || !addEmail.trim()) return;
    setIsMemberBusy(true);
    try {
      const receipt = await client.inviteProjectMember(project.id, {
        email: addEmail.trim(),
        role: addRole
      });
      setAddEmail("");
      setAddRole("editor");
      setInviteUrl(receipt.inviteUrl);
      setIsInviteCopied(false);
      await loadMembers();
      setMemberError("");
      setMemberNotice(
        receipt.deliveryStatus === "sent"
          ? `Invitation emailed to ${receipt.invitation.email}.`
          : receipt.deliveryStatus === "failed"
            ? "The invitation is active, but email delivery failed. Copy and send the secure link below."
            : "The invitation is active. Copy and send the secure link below."
      );
    } catch (addError) {
      setMemberNotice("");
      setInviteUrl("");
      setMemberError(getErrorMessage(addError, "Unable to invite this member."));
    } finally {
      setIsMemberBusy(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setIsInviteCopied(true);
    } catch {
      setMemberError("Copy was blocked by the browser. Select the link and copy it manually.");
    }
  };

  const revokeInvitation = async (invitation: ProjectInvitation) => {
    if (!project) return;
    setIsMemberBusy(true);
    setMemberNotice("");
    try {
      await client.revokeProjectInvitation(project.id, invitation.id);
      await loadMembers();
      setMemberError("");
      setMemberNotice(`Invitation for ${invitation.email} revoked.`);
      setInviteUrl("");
    } catch (revokeError) {
      setMemberError(getErrorMessage(revokeError, "Unable to revoke this invitation."));
    } finally {
      setIsMemberBusy(false);
    }
  };

  const changeRole = async (member: ProjectMember, role: ProjectRole) => {
    if (!project) return;
    setIsMemberBusy(true);
    setMemberNotice("");
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
    setMemberNotice("");
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
            {project && onArchive && isOwner ? (
              <button
                className="button danger ghost"
                disabled={isSaving}
                type="button"
                onClick={() => setIsArchiveConfirmOpen(true)}
              >
                <Archive size={16} /> Archive
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
              <div className="member-section-actions">
                {!isOwner ? <small>Read only — ask an owner to make changes.</small> : null}
                {isOwner && onOpenWorkflowSettings ? (
                  <button
                    className="text-link"
                    onClick={() => onOpenWorkflowSettings(project)}
                    type="button"
                  >
                    <Settings2 size={14} /> Workflow rules
                  </button>
                ) : null}
              </div>
            </header>
            {memberError ? <p className="form-alert error">{memberError}</p> : null}
            {memberNotice ? <p className="form-alert notice">{memberNotice}</p> : null}
            {inviteUrl ? (
              <div className="invitation-copy-row">
                <label>
                  <span>Secure invitation link</span>
                  <input readOnly value={inviteUrl} onFocus={(event) => event.target.select()} />
                </label>
                <button className="button secondary" onClick={() => void copyInviteLink()} type="button">
                  {isInviteCopied ? <Check size={15} /> : <Copy size={15} />}
                  {isInviteCopied ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : null}
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
                        onChange={(event) =>
                          void changeRole(member, event.target.value as ProjectRole)
                        }
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
              <>
                <section className="pending-invitations" aria-labelledby="pending-invitations-title">
                  <header>
                    <span className="overline" id="pending-invitations-title">
                      Pending invitations
                    </span>
                    <strong>{invitations.length}</strong>
                  </header>
                  {invitations.length ? (
                    <ul>
                      {invitations.map((invitation) => (
                        <li key={invitation.id}>
                          <Mail aria-hidden="true" size={16} />
                          <div>
                            <strong>{invitation.email}</strong>
                            <span>
                              {roleLabel[invitation.role]} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                            </span>
                          </div>
                          <span className={`invitation-delivery ${invitation.deliveryStatus}`}>
                            {invitation.deliveryStatus === "sent" ? "Emailed" : "Link only"}
                          </span>
                          <button
                            aria-label={`Revoke invitation for ${invitation.email}`}
                            className="icon-button"
                            disabled={isMemberBusy}
                            onClick={() => void revokeInvitation(invitation)}
                            title="Revoke invitation"
                            type="button"
                          >
                            <XCircle size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No one is waiting to join this project.</p>
                  )}
                </section>

                <form className="member-add-row" onSubmit={inviteMember}>
                  <input
                    aria-label="Invite member by email"
                    disabled={isMemberBusy}
                    onChange={(event) => setAddEmail(event.target.value)}
                    placeholder="teammate@company.com"
                    type="email"
                    value={addEmail}
                  />
                  <select
                    aria-label="Invited member role"
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
                    <UserPlus size={15} /> Invite
                  </button>
                </form>
                <p className="member-invite-help">
                  Membership starts only after the recipient signs in with this exact email and accepts.
                </p>
              </>
            ) : null}
          </section>
        ) : null}
      </section>
      {project && isArchiveConfirmOpen ? (
        <ConfirmationDialog
          confirmLabel="Archive project"
          description={`“${project.name}” and its ${project.taskCount} active ticket${project.taskCount === 1 ? "" : "s"} will leave the active workspace together. Nothing moves to Inbox and the complete project can be restored later.`}
          isBusy={isSaving}
          onCancel={() => setIsArchiveConfirmOpen(false)}
          onConfirm={() => void onArchive?.(project)}
          title="Archive this project?"
        />
      ) : null}
    </div>
  );
}

export default ProjectModal;
