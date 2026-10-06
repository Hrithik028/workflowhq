import { useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  tenantsApi,
  type TenantAiPolicy,
  type TenantMember,
  type TenantRules,
  type TenantWorkspace
} from "../api/tenants";
import { getErrorMessage } from "../api/client";
import type { LayoutContext } from "../components/AppLayout";
import ConfirmationDialog from "../components/ConfirmationDialog";
import { DelayedLoadingScreen } from "../components/LoadingExperience";
import "../components/workspace-management.css";

export default function Workspaces() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const [workspaces, setWorkspaces] = useState<TenantWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [details, setDetails] = useState<{
    id: number;
    members: TenantMember[];
    rules: TenantRules;
    aiPolicy: TenantAiPolicy;
    audit: Array<{ action: string; created_at: string }>;
  } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<TenantMember | null>(null);
  const [nextOwner, setNextOwner] = useState("");
  const [password, setPassword] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const selected = workspaces.find((item) => Number(item.id) === selectedId);
  const canManage = selected && ["owner", "admin"].includes(selected.my_role);
  const currentDetails = details?.id === selectedId ? details : null;

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    tenantsApi
      .list()
      .then((result) => {
        if (!active) return;
        setEnabled(result.meta.enabled);
        setWorkspaces(result.data);
        setSelectedId(Number(result.meta.activeWorkspaceId) || Number(result.data[0]?.id) || null);
      })
      .catch((failure) => {
        if (active) setError(getErrorMessage(failure, "Unable to load workspaces."));
      });
    return () => {
      active = false;
    };
  }, [isDemo]);

  useEffect(() => {
    if (!selectedId || !canManage || !enabled) return;
    let active = true;
    Promise.all([tenantsApi.members(selectedId), tenantsApi.settings(selectedId)])
      .then(([members, settings]) => {
        if (active) setDetails({ id: selectedId, members, ...settings });
      })
      .catch((failure) => {
        if (active) setError(getErrorMessage(failure, "Unable to load workspace settings."));
      });
    return () => {
      active = false;
    };
  }, [selectedId, canManage, enabled]);

  const refreshMembers = async () => {
    if (!selectedId) return;
    const [members, settings] = await Promise.all([
      tenantsApi.members(selectedId),
      tenantsApi.settings(selectedId)
    ]);
    setDetails({ id: selectedId, members, ...settings });
  };
  const perform = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
    } catch (failure) {
      setError(getErrorMessage(failure, "Unable to save this change."));
    } finally {
      setBusy(false);
    }
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const workspace = await tenantsApi.create(name);
      setWorkspaces((items) => [...items, workspace]);
      setSelectedId(Number(workspace.id));
      setName("");
    }, "Workspace created. Select Use workspace to start working here.");
  };
  const addMember = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    void perform(async () => {
      await tenantsApi.saveMember(selectedId, email, role);
      setEmail("");
      await refreshMembers();
    }, "Workspace member saved. Add them to individual projects to share project work.");
  };

  if (isDemo || enabled === false)
    return (
      <main className="workspace-management">
        <h1>Workspaces</h1>
        <p>Workspace management is available on deployments with workspace isolation enabled.</p>
        <Link to="/app">Back to overview</Link>
      </main>
    );
  return (
    <main className="workspace-management">
      <span className="overline">Workspace administration</span>
      <h1>Your workspaces</h1>
      <p>Keep projects, integrations and team access organized in separate workspaces.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {enabled === null && !error ? (
        <DelayedLoadingScreen message="Loading workspaces" inline />
      ) : (
        <>
          <section>
            <h2>Create a workspace</h2>
            <form onSubmit={create}>
              <input
                aria-label="Workspace name"
                placeholder="Workspace name"
                value={name}
                maxLength={120}
                required
                onChange={(event) => setName(event.target.value)}
              />
              <button disabled={busy}>Create workspace</button>
            </form>
          </section>
          <section>
            <h2>Workspace settings</h2>
            <div className="workspace-choice">
              <select
                aria-label="Manage workspace"
                disabled={busy}
                value={selectedId ?? ""}
                onChange={(event) => {
                  setError("");
                  setNotice("");
                  setNextOwner("");
                  setPassword("");
                  setSelectedId(Number(event.target.value));
                }}
              >
                {workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.my_role}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !selectedId}
                onClick={() =>
                  void perform(async () => {
                    await tenantsApi.switchTo(selectedId!);
                    window.location.assign("/app");
                  }, "Workspace selected.")
                }
              >
                Use workspace
              </button>
            </div>
            {selected && !canManage && (
              <p>
                You are a member here. Ask a workspace administrator to change team access or rules.
              </p>
            )}
            {canManage && !currentDetails && !error && (
              <DelayedLoadingScreen key={selectedId} message="Loading workspace settings" inline />
            )}
            {currentDetails && canManage && (
              <>
                <h3>Members</h3>
                <p>
                  Members must already have a WorkflowHQ account. Workspace access does not
                  automatically grant access to every project.
                </p>
                <form onSubmit={addMember}>
                  <input
                    type="email"
                    aria-label="Member email"
                    placeholder="Member email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <select
                    aria-label="Workspace member role"
                    value={role}
                    onChange={(event) => setRole(event.target.value as typeof role)}
                  >
                    <option value="member">Member</option>
                    {selected?.my_role === "owner" && <option value="admin">Administrator</option>}
                  </select>
                  <button disabled={busy}>Save member</button>
                </form>
                <ul>
                  {currentDetails.members.map((member) => (
                    <li key={member.id}>
                      <span>
                        <strong>{member.name}</strong>
                        <br />
                        {member.email} · {member.role}
                      </span>
                      {member.role !== "owner" &&
                        (member.role !== "admin" || selected?.my_role === "owner") && (
                          <button disabled={busy} onClick={() => setRemoving(member)}>
                            Remove member
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
                <h3>Rules</h3>
                <p>Workspace rules can add restrictions within the platform's limits.</p>
                <form
                  className="workspace-rules"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform(async () => {
                      const rules = await tenantsApi.saveRules(selectedId!, currentDetails.rules);
                      setDetails({ ...currentDetails, rules });
                    }, "Workspace rules saved.");
                  }}
                >
                  {(
                    [
                      ["allow_task_deletion", "Allow permanent ticket deletion"],
                      ["allow_project_deletion", "Allow empty project deletion"],
                      [
                        "require_due_date_for_high_priority",
                        "Require due dates for high priority tickets"
                      ]
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={currentDetails.rules[key]}
                        onChange={(event) =>
                          setDetails({
                            ...currentDetails,
                            rules: { ...currentDetails.rules, [key]: event.target.checked }
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <label>
                    Open tickets per user
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={currentDetails.rules.max_open_tasks_per_user}
                      onChange={(event) =>
                        setDetails({
                          ...currentDetails,
                          rules: {
                            ...currentDetails.rules,
                            max_open_tasks_per_user: Number(event.target.value)
                          }
                        })
                      }
                    />
                  </label>
                  <button disabled={busy}>Save rules</button>
                </form>
                <h3>AI restrictions</h3>
                <p>
                  Governance is always enforced. These workspace limits can only tighten platform
                  policy, never turn it off. Your daily usage is counted across workspaces.
                </p>
                <form
                  className="workspace-rules"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform(async () => {
                      await tenantsApi.saveAiPolicy(selectedId!, currentDetails.aiPolicy);
                      await refreshMembers();
                    }, "Workspace AI restrictions saved.");
                  }}
                >
                  {(["openai", "anthropic", "google"] as const).map((provider) => (
                    <label key={provider}>
                      <input
                        type="checkbox"
                        checked={currentDetails.aiPolicy.allowedProviders.includes(provider)}
                        onChange={(event) =>
                          setDetails({
                            ...currentDetails,
                            aiPolicy: {
                              ...currentDetails.aiPolicy,
                              allowedProviders: event.target.checked
                                ? [...currentDetails.aiPolicy.allowedProviders, provider]
                                : currentDetails.aiPolicy.allowedProviders.filter(
                                    (item) => item !== provider
                                  )
                            }
                          })
                        }
                      />
                      Allow {provider}
                    </label>
                  ))}
                  {(
                    [
                      ["dailyRunLimit", "AI runs per day", 1, 100],
                      ["maxPromptCharacters", "Prompt character limit", 100, 50000],
                      ["maxOutputTokens", "Output token limit", 100, 10000],
                      ["maxProposedActions", "Actions per proposal", 1, 50]
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        required
                        min={min}
                        max={max}
                        value={currentDetails.aiPolicy[key]}
                        onChange={(event) =>
                          setDetails({
                            ...currentDetails,
                            aiPolicy: {
                              ...currentDetails.aiPolicy,
                              [key]: Number(event.target.value)
                            }
                          })
                        }
                      />
                    </label>
                  ))}
                  <button disabled={busy}>Save AI restrictions</button>
                </form>
                {selected?.my_role === "owner" && !selected.personal_owner_id && (
                  <>
                    <h3>Transfer ownership</h3>
                    <p>
                      Team workspace ownership can be transferred to an existing member. Personal
                      workspaces stay with their account.
                    </p>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        setConfirmTransfer(true);
                      }}
                    >
                      <select
                        aria-label="New workspace owner"
                        required
                        value={nextOwner}
                        onChange={(event) => setNextOwner(event.target.value)}
                      >
                        <option value="">Choose a member</option>
                        {currentDetails.members
                          .filter((member) => member.role !== "owner")
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                      </select>
                      <input
                        aria-label="Confirm your password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <button disabled={busy}>Review ownership transfer</button>
                    </form>
                  </>
                )}
                <h3>Recent changes</h3>
                <ul>
                  {currentDetails.audit.map((item, index) => (
                    <li key={index}>
                      <span>{item.action.replaceAll("_", " ")}</span>
                      <time>{new Date(item.created_at).toLocaleString()}</time>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
      {removing && (
        <ConfirmationDialog
          title={`Remove ${removing.name}?`}
          description="This removes their workspace and project memberships here. Their account and access to other workspaces are preserved."
          confirmLabel="Remove member"
          isBusy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            void perform(async () => {
              await tenantsApi.removeMember(selectedId!, removing.id);
              await refreshMembers();
              setRemoving(null);
            }, "Member removed.")
          }
        />
      )}
      {confirmTransfer && (
        <ConfirmationDialog
          title="Transfer workspace ownership?"
          description="The selected member will become the workspace owner. You will remain an administrator. This does not transfer platform ownership or individual projects."
          confirmLabel="Transfer ownership"
          isBusy={busy}
          onCancel={() => setConfirmTransfer(false)}
          onConfirm={() =>
            void perform(async () => {
              await tenantsApi.transferOwnership(selectedId!, Number(nextOwner), password);
              setPassword("");
              setConfirmTransfer(false);
              setWorkspaces((await tenantsApi.list()).data);
              await refreshMembers();
            }, "Workspace ownership transferred.")
          }
        />
      )}
    </main>
  );
}
