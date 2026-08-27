import {
  Check,
  Clock3,
  FolderKanban,
  Github,
  KeyRound,
  Save,
  Settings2,
  ShieldCheck,
  ShieldOff,
  TicketCheck,
  UserCog,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { adminApi } from "../api/admin";
import { getErrorMessage } from "../api/client";
import type { LayoutContext } from "../components/AppLayout";
import type {
  AdminAuditEntry,
  AdminOverview,
  AdminUser,
  PermissionKey,
  PermissionSet,
  WorkspaceRules
} from "../types";
import { formatRelativeTime } from "../utils/format";

const fullPermissions: PermissionSet = {
  "projects.create": true,
  "projects.edit": true,
  "projects.delete": true,
  "projects.members": true,
  "tasks.create": true,
  "tasks.edit": true,
  "tasks.delete": true,
  "github.manage": true
};

const demoOverview: AdminOverview = {
  users: [
    {
      id: 101,
      name: "Alicia Moore",
      email: "alicia@workflowhq.dev",
      role: "admin",
      projectCount: 6,
      taskCount: 28,
      createdAt: new Date(Date.now() - 120 * 86_400_000).toISOString(),
      permissions: { ...fullPermissions }
    },
    {
      id: 102,
      name: "Alex Lee",
      email: "alex@workflowhq.dev",
      role: "user",
      projectCount: 3,
      taskCount: 17,
      createdAt: new Date(Date.now() - 78 * 86_400_000).toISOString(),
      permissions: { ...fullPermissions }
    },
    {
      id: 103,
      name: "Riley Brown",
      email: "riley@workflowhq.dev",
      role: "user",
      projectCount: 2,
      taskCount: 11,
      createdAt: new Date(Date.now() - 44 * 86_400_000).toISOString(),
      permissions: {
        ...fullPermissions,
        "projects.delete": false,
        "tasks.delete": false,
        "github.manage": false
      }
    },
    {
      id: 104,
      name: "Ananya Singh",
      email: "ananya@workflowhq.dev",
      role: "user",
      projectCount: 4,
      taskCount: 21,
      createdAt: new Date(Date.now() - 31 * 86_400_000).toISOString(),
      permissions: { ...fullPermissions, "github.manage": false }
    }
  ],
  rules: {
    allow_task_deletion: true,
    allow_project_deletion: false,
    require_due_date_for_high_priority: true,
    max_open_tasks_per_user: 100
  },
  audit: [
    {
      id: 1,
      action: "workspace_rules_updated",
      details: {},
      adminName: "Alicia Moore",
      targetName: null,
      createdAt: new Date(Date.now() - 18 * 60_000).toISOString()
    },
    {
      id: 2,
      action: "user_access_updated",
      details: {},
      adminName: "Alicia Moore",
      targetName: "Riley Brown",
      createdAt: new Date(Date.now() - 46 * 60_000).toISOString()
    }
  ],
  permissionKeys: Object.keys(fullPermissions) as PermissionKey[]
};

const permissionCopy: Record<PermissionKey, { title: string; copy: string; group: string }> = {
  "projects.create": {
    title: "Create projects",
    copy: "Start new project workspaces.",
    group: "Projects"
  },
  "projects.edit": {
    title: "Edit projects",
    copy: "Change project names, keys, and briefs.",
    group: "Projects"
  },
  "projects.delete": {
    title: "Delete projects",
    copy: "Remove projects while retaining unassigned tickets.",
    group: "Projects"
  },
  "projects.members": {
    title: "Manage project members",
    copy: "Add, remove, and change roles for project members.",
    group: "Projects"
  },
  "tasks.create": {
    title: "Create tickets",
    copy: "Create issues and child work.",
    group: "Tickets"
  },
  "tasks.edit": {
    title: "Edit tickets",
    copy: "Update hierarchy, status, priority, and dates.",
    group: "Tickets"
  },
  "tasks.delete": {
    title: "Delete tickets",
    copy: "Permanently remove tickets without children.",
    group: "Tickets"
  },
  "github.manage": {
    title: "Manage GitHub",
    copy: "Choose synchronized repositories and integration settings.",
    group: "Integrations"
  }
};

const auditCopy = (entry: AdminAuditEntry) =>
  entry.action === "workspace_rules_updated"
    ? `${entry.adminName} changed workspace rules`
    : `${entry.adminName} changed access for ${entry.targetName || "a member"}`;

function Toggle({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-pressed={checked}
      className={`admin-switch ${checked ? "on" : ""}`}
      type="button"
      onClick={() => onChange(!checked)}
    >
      <span>{checked ? <Check size={12} /> : null}</span>
      <b>{label}</b>
    </button>
  );
}

function SettingsAdmin() {
  const { isDemo, user } = useOutletContext<LayoutContext>();
  const canAdminister = isDemo || user.role === "admin";
  const [overview, setOverview] = useState<AdminOverview | null>(isDemo ? demoOverview : null);
  const [selectedId, setSelectedId] = useState<number>(demoOverview.users[1].id);
  const [draftUser, setDraftUser] = useState<AdminUser | null>(demoOverview.users[1]);
  const [draftRules, setDraftRules] = useState<WorkspaceRules>(demoOverview.rules);
  const [isLoading, setIsLoading] = useState(!isDemo && canAdminister);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!canAdminister || isDemo) return;
    setIsLoading(true);
    try {
      const next = await adminApi.getOverview();
      setOverview(next);
      setDraftRules(next.rules);
      const selected = next.users.find((member) => member.id === selectedId) || next.users[0];
      setSelectedId(selected?.id || 0);
      setDraftUser(selected || null);
      setNotice(null);
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "Unable to load administrator controls.")
      });
    } finally {
      setIsLoading(false);
    }
  }, [canAdminister, isDemo, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectMember = (member: AdminUser) => {
    setSelectedId(member.id);
    setDraftUser({ ...member, permissions: { ...member.permissions } });
    setNotice(null);
  };

  const saveAccess = async () => {
    if (!draftUser || !overview) return;
    setIsSaving(true);
    try {
      const saved = isDemo
        ? { ...draftUser }
        : await adminApi.updateUserAccess(draftUser.id, draftUser.role, draftUser.permissions);
      setOverview({
        ...overview,
        users: overview.users.map((member) => (member.id === saved.id ? saved : member)),
        audit: isDemo
          ? [
              {
                id: Date.now(),
                action: "user_access_updated",
                details: {},
                adminName: "Demo administrator",
                targetName: saved.name,
                createdAt: new Date().toISOString()
              },
              ...overview.audit
            ]
          : overview.audit
      });
      setDraftUser(saved);
      setNotice({ tone: "success", text: `Access updated for ${saved.name}.` });
      if (!isDemo) await load();
    } catch (error) {
      setNotice({ tone: "error", text: getErrorMessage(error, "Unable to update this member.") });
    } finally {
      setIsSaving(false);
    }
  };

  const saveRules = async () => {
    if (!overview) return;
    setIsSaving(true);
    try {
      const saved = isDemo ? { ...draftRules } : await adminApi.updateRules(draftRules);
      setOverview({
        ...overview,
        rules: saved,
        audit: isDemo
          ? [
              {
                id: Date.now(),
                action: "workspace_rules_updated",
                details: {},
                adminName: "Demo administrator",
                targetName: null,
                createdAt: new Date().toISOString()
              },
              ...overview.audit
            ]
          : overview.audit
      });
      setDraftRules(saved);
      setNotice({ tone: "success", text: "Workspace rules updated." });
      if (!isDemo) await load();
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "Unable to update workspace rules.")
      });
    } finally {
      setIsSaving(false);
    }
  };

  const restrictedMembers = useMemo(
    () =>
      overview?.users.filter((member) => Object.values(member.permissions).some((value) => !value))
        .length || 0,
    [overview]
  );

  return (
    <main className="workspace-page admin-settings-page">
      <header className="engineering-page-header admin-settings-header">
        <div>
          <span className="overline">Settings / Administration</span>
          <h1>Rules &amp; access</h1>
          <p>Control who can change work and which guardrails apply across WorkflowHQ.</p>
        </div>
        <div className="admin-security-mark">
          <ShieldCheck size={24} />
          <span>Server enforced</span>
          <small>{isDemo ? "Safe preview mode" : "Live policy"}</small>
        </div>
      </header>

      {!canAdminister ? (
        <section className="admin-denied">
          <ShieldOff size={34} />
          <span className="overline">Member access</span>
          <h2>Administrator controls are protected.</h2>
          <p>
            Your current role can use WorkflowHQ but cannot change roles, permissions, or workspace
            rules. Ask an administrator if your access needs to change.
          </p>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <>
          {notice ? (
            <button
              className={`admin-notice ${notice.tone}`}
              type="button"
              onClick={() => setNotice(null)}
            >
              {notice.text}
              <span>×</span>
            </button>
          ) : null}
          <section className="admin-metrics">
            <article>
              <Users size={18} />
              <span>Workspace members</span>
              <strong>{overview?.users.length || 0}</strong>
            </article>
            <article>
              <ShieldCheck size={18} />
              <span>Administrators</span>
              <strong>
                {overview?.users.filter((member) => member.role === "admin").length || 0}
              </strong>
            </article>
            <article>
              <KeyRound size={18} />
              <span>Restricted members</span>
              <strong>{restrictedMembers}</strong>
            </article>
            <article>
              <Clock3 size={18} />
              <span>Policy changes</span>
              <strong>{overview?.audit.length || 0}</strong>
            </article>
          </section>

          {isLoading || !overview ? (
            <p className="register-loading">Loading access policy…</p>
          ) : (
            <div className="admin-console-grid">
              <section className="member-register">
                <header>
                  <span className="overline">01 / Members</span>
                  <h2>Access register</h2>
                  <p>Select a person to configure their authority.</p>
                </header>
                <div>
                  {overview.users.map((member) => (
                    <button
                      className={selectedId === member.id ? "selected" : ""}
                      key={member.id}
                      type="button"
                      onClick={() => selectMember(member)}
                    >
                      <span className="member-avatar">
                        {member.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </span>
                      <em className={member.role}>{member.role}</em>
                      <b>
                        {member.projectCount}P / {member.taskCount}T
                      </b>
                    </button>
                  ))}
                </div>
              </section>

              <section className="permission-editor">
                <header>
                  <span className="overline">02 / Permissions</span>
                  <div>
                    <h2>{draftUser?.name || "Select a member"}</h2>
                    <p>Changes are checked by the API on every protected operation.</p>
                  </div>
                  {draftUser ? (
                    <label>
                      Role
                      <select
                        value={draftUser.role}
                        onChange={(event) =>
                          setDraftUser({
                            ...draftUser,
                            role: event.target.value as AdminUser["role"]
                          })
                        }
                      >
                        <option value="user">USER</option>
                        <option value="admin">ADMIN</option>
                      </select>
                    </label>
                  ) : null}
                </header>
                {draftUser ? (
                  <div className="permission-list">
                    {overview.permissionKeys.map((key) => {
                      const copy = permissionCopy[key];
                      const Icon =
                        copy.group === "Projects"
                          ? FolderKanban
                          : copy.group === "Tickets"
                            ? TicketCheck
                            : Github;
                      return (
                        <article key={key}>
                          <Icon size={17} />
                          <span>
                            <small>{copy.group}</small>
                            <strong>{copy.title}</strong>
                            <p>{copy.copy}</p>
                          </span>
                          <Toggle
                            checked={draftUser.permissions[key]}
                            label={draftUser.permissions[key] ? "Allowed" : "Blocked"}
                            onChange={(checked) =>
                              setDraftUser({
                                ...draftUser,
                                permissions: { ...draftUser.permissions, [key]: checked }
                              })
                            }
                          />
                        </article>
                      );
                    })}
                  </div>
                ) : null}
                <footer>
                  <span>
                    <KeyRound size={15} /> Administrator role always has every permission.
                  </span>
                  <button
                    className="button primary"
                    disabled={!draftUser || isSaving}
                    type="button"
                    onClick={() => void saveAccess()}
                  >
                    <Save size={15} /> Save access
                  </button>
                </footer>
              </section>
            </div>
          )}

          {overview ? (
            <div className="admin-policy-grid">
              <section className="workspace-rules">
                <header>
                  <span className="overline">03 / Workspace policy</span>
                  <h2>Operational rules</h2>
                  <p>These rules apply after individual permissions are checked.</p>
                </header>
                <div>
                  <label>
                    <span>
                      <strong>Allow ticket deletion</strong>
                      <small>Members with delete permission may remove childless tickets.</small>
                    </span>
                    <Toggle
                      checked={draftRules.allow_task_deletion}
                      label={draftRules.allow_task_deletion ? "Enabled" : "Disabled"}
                      onChange={(checked) =>
                        setDraftRules({ ...draftRules, allow_task_deletion: checked })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      <strong>Allow project deletion</strong>
                      <small>Projects can be removed while their tickets move to Inbox.</small>
                    </span>
                    <Toggle
                      checked={draftRules.allow_project_deletion}
                      label={draftRules.allow_project_deletion ? "Enabled" : "Disabled"}
                      onChange={(checked) =>
                        setDraftRules({ ...draftRules, allow_project_deletion: checked })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      <strong>Require dates for high priority</strong>
                      <small>P1 tickets cannot be created without an explicit due date.</small>
                    </span>
                    <Toggle
                      checked={draftRules.require_due_date_for_high_priority}
                      label={
                        draftRules.require_due_date_for_high_priority ? "Required" : "Optional"
                      }
                      onChange={(checked) =>
                        setDraftRules({
                          ...draftRules,
                          require_due_date_for_high_priority: checked
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      <strong>Maximum open tickets per user</strong>
                      <small>Prevents unlimited uncompleted work from accumulating.</small>
                    </span>
                    <input
                      min="1"
                      max="1000"
                      type="number"
                      value={draftRules.max_open_tasks_per_user}
                      onChange={(event) =>
                        setDraftRules({
                          ...draftRules,
                          max_open_tasks_per_user: Math.max(
                            1,
                            Math.min(1000, Number(event.target.value) || 1)
                          )
                        })
                      }
                    />
                  </label>
                </div>
                <footer>
                  <span>Rules take effect immediately.</span>
                  <button
                    className="button primary"
                    disabled={isSaving}
                    type="button"
                    onClick={() => void saveRules()}
                  >
                    <Save size={15} /> Save rules
                  </button>
                </footer>
              </section>
              <aside className="admin-audit">
                <header>
                  <span className="overline">04 / Audit trail</span>
                  <h2>Recent policy changes</h2>
                </header>
                {overview.audit.length ? (
                  overview.audit.slice(0, 8).map((entry) => (
                    <article key={entry.id}>
                      <UserCog size={16} />
                      <div>
                        <strong>{auditCopy(entry)}</strong>
                        <span>{formatRelativeTime(entry.createdAt)}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p>No administrator changes have been recorded yet.</p>
                )}
                <footer>
                  <Settings2 size={15} /> Every policy update is recorded.
                </footer>
              </aside>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

export default SettingsAdmin;
