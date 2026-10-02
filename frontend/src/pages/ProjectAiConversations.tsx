import {
  ArrowLeft,
  Bot,
  Check,
  Clock3,
  GitCompareArrows,
  History,
  MessageSquarePlus,
  Plus,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { aiConversationsApi } from "../api/aiConversations";
import { aiPlannerApi } from "../api/aiPlanner";
import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import { AiModelPicker } from "../components/AiModelPicker";
import { AiActionReview } from "../components/AiActionReview";
import { budgetModels as providerDefaults } from "../lib/aiModels";
import type {
  AiConversation,
  AiConversationDetail,
  AiProposalDiff,
  AiProvider,
  Project
} from "../types";

const readableTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );

function ProposalDiff({ diff }: { diff: AiProposalDiff | null }) {
  if (!diff) return <p className="ai-retained-note">Detailed diff is no longer retained.</p>;
  if (!diff.added.length && !diff.changed.length && !diff.removed.length) {
    return <p className="ai-retained-note">No task-level changes from the previous revision.</p>;
  }
  return (
    <ul className="ai-revision-diff">
      {diff.added.map((title) => (
        <li className="added" key={`added-${title}`}>
          Added “{title}”
        </li>
      ))}
      {diff.changed.map((change) => (
        <li className="changed" key={`${change.from}-${change.to}`}>
          Changed “{change.from}” to “{change.to}”
        </li>
      ))}
      {diff.removed.map((title) => (
        <li className="removed" key={`removed-${title}`}>
          Removed “{title}”
        </li>
      ))}
    </ul>
  );
}

function ProjectAiConversations() {
  const projectId = Number(useParams().id);
  const [project, setProject] = useState<Project | null>(null);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<AiConversationDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState(providerDefaults.openai);
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [outputMode, setOutputMode] = useState<"tasks" | "actions">("tasks");
  const [confirmedProposal, setConfirmedProposal] = useState("");
  const [busy, setBusy] = useState<"create" | "run" | "approve" | "discard" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadList = useCallback(async () => {
    const [projects, items] = await Promise.all([
      workspaceApi.listProjects(),
      aiConversationsApi.list(projectId)
    ]);
    setProject(projects.find((item) => item.id === projectId) || null);
    setConversations(items);
    setSelectedId((current) => current || items[0]?.id || "");
  }, [projectId]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail(await aiConversationsApi.get(projectId, selectedId));
  }, [projectId, selectedId]);

  useEffect(() => {
    let active = true;
    Promise.all([workspaceApi.listProjects(), aiConversationsApi.list(projectId)])
      .then(([projects, items]) => {
        if (!active) return;
        setProject(projects.find((item) => item.id === projectId) || null);
        setConversations(items);
        setSelectedId((current) => current || items[0]?.id || "");
      })
      .catch((loadError) => {
        if (active) setError(getErrorMessage(loadError, "Unable to load AI conversations."));
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    aiConversationsApi
      .get(projectId, selectedId)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((loadError) => {
        if (active) setError(getErrorMessage(loadError, "Unable to load this AI conversation."));
      });
    return () => {
      active = false;
    };
  }, [projectId, selectedId]);

  const createConversation = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      const created = await aiConversationsApi.create(projectId, { title, provider, model });
      setTitle("");
      setShowCreate(false);
      setSelectedId(created.id);
      await loadList();
      setNotice("Conversation created. Provider and model are now pinned.");
    } catch (createError) {
      setError(getErrorMessage(createError, "Unable to create the conversation."));
    } finally {
      setBusy(null);
    }
  };

  const run = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setBusy("run");
    setError("");
    setNotice("");
    try {
      await aiConversationsApi.run(projectId, selectedId, {
        goal,
        context,
        maxItems: 12,
        outputMode,
        contextOptions: {
          includeProjectTasks: true,
          includeGithubActivity: false,
          repositoryIds: []
        }
      });
      setGoal("");
      setContext("");
      await Promise.all([loadList(), loadDetail()]);
      setNotice("A new proposal revision is ready for review.");
    } catch (runError) {
      setError(getErrorMessage(runError, "Unable to generate a proposal."));
      await loadDetail().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    const proposal = detail?.proposals.find((item) => item.canApprove);
    if (!proposal?.approvalId || !proposal.plan) return;
    setBusy("approve");
    setError("");
    try {
      if ("actions" in proposal.plan) {
        if (confirmedProposal !== proposal.id) return;
        const key = `proposal:${proposal.approvalId}`;
        const result = await aiPlannerApi.applyActions(
          projectId,
          proposal.approvalId,
          proposal.plan,
          key
        );
        setNotice(
          `${result.results.length} approved actions applied${result.idempotent ? " (retry confirmed)" : ""}.`
        );
      } else {
        const created = await aiPlannerApi.apply(projectId, proposal.approvalId, proposal.plan);
        setNotice(`${created.length} task${created.length === 1 ? "" : "s"} created.`);
      }
      await loadDetail();
    } catch (approveError) {
      setError(getErrorMessage(approveError, "Unable to approve this proposal."));
      await loadDetail().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    const proposal = detail?.proposals.find((item) => item.canApprove);
    if (!proposal) return;
    setBusy("discard");
    setError("");
    try {
      await aiConversationsApi.discard(projectId, selectedId, proposal.id);
      await loadDetail();
      setNotice("Proposal discarded. No changes were made.");
    } catch (discardError) {
      setError(getErrorMessage(discardError, "Unable to discard this proposal."));
    } finally {
      setBusy(null);
    }
  };

  const canEdit = project?.myRole === "owner" || project?.myRole === "editor";

  return (
    <main className="workspace-page editorial-page ai-conversations-page">
      <header className="workspace-header editorial-page-header">
        <div>
          <span className="overline">{project?.key || "Project"} / AI planning</span>
          <h1>Conversation workspace.</h1>
          <p>
            Review every version, its evidence, and its changes before allowing WorkflowHQ to create
            work.
          </p>
        </div>
        <div className="header-actions">
          <Link className="button secondary" to="/projects">
            <ArrowLeft size={16} /> Projects
          </Link>
          {canEdit ? (
            <button className="button primary" type="button" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New conversation
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-alert error">{error}</p> : null}
      {notice ? <p className="form-alert success">{notice}</p> : null}

      {showCreate ? (
        <form className="ai-conversation-create" onSubmit={createConversation}>
          <label>
            <span>Conversation title</span>
            <input
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <span>Provider</span>
            <select
              value={provider}
              onChange={(event) => {
                const next = event.target.value as AiProvider;
                setProvider(next);
                setModel(providerDefaults[next]);
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google Gemini</option>
            </select>
          </label>
          <AiModelPicker key={provider} provider={provider} value={model} onChange={setModel} />
          <div className="ai-conversation-create-actions">
            <button className="button secondary" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="button primary" disabled={busy !== null} type="submit">
              <MessageSquarePlus size={16} /> {busy === "create" ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="ai-conversation-layout">
        <aside className="ai-conversation-index" aria-label="AI conversations">
          <header>
            <History size={17} />
            <strong>Conversations</strong>
            <span>{conversations.length}</span>
          </header>
          {conversations.map((conversation) => (
            <button
              className={conversation.id === selectedId ? "active" : ""}
              key={conversation.id}
              type="button"
              onClick={() => setSelectedId(conversation.id)}
            >
              <strong>{conversation.title}</strong>
              <span>
                {conversation.provider} / {conversation.model}
              </span>
              <small>{conversation.proposalCount} revisions</small>
            </button>
          ))}
          {!conversations.length ? (
            <p>No conversations yet. Start one to keep planning history in this project.</p>
          ) : null}
        </aside>

        <section className="ai-conversation-workspace">
          {detail ? (
            <>
              <header className="ai-conversation-title">
                <div>
                  <span className="overline">Pinned provider</span>
                  <h2>{detail.conversation.title}</h2>
                  <p>
                    {detail.conversation.provider} / {detail.conversation.model}
                  </p>
                </div>
                <span className="ai-retention-badge">
                  <ShieldCheck size={15} /> Detail retained until{" "}
                  {readableTime(detail.conversation.detailExpiresAt)}
                </span>
              </header>

              {canEdit ? (
                <form className="ai-conversation-prompt" onSubmit={run}>
                  <div className="ai-request-key-note">
                    Credentials stay encrypted in your personal vault, never in conversation
                    history.
                  </div>
                  <label>
                    <span>Proposal mode</span>
                    <select
                      value={outputMode}
                      onChange={(event) => setOutputMode(event.target.value as "tasks" | "actions")}
                    >
                      <option value="tasks">Create new tickets only</option>
                      <option value="actions">Propose ticket and criteria changes</option>
                    </select>
                  </label>
                  <label>
                    <span>Planning goal</span>
                    <textarea
                      required
                      minLength={10}
                      maxLength={5000}
                      rows={3}
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>
                      Additional context <small>optional</small>
                    </span>
                    <textarea
                      maxLength={10000}
                      rows={2}
                      value={context}
                      onChange={(event) => setContext(event.target.value)}
                    />
                  </label>
                  <div className="ai-prompt-footer">
                    <p>Your saved provider credential is used securely by the server.</p>
                    <button className="button primary" disabled={busy !== null} type="submit">
                      <Bot size={16} /> {busy === "run" ? "Generating…" : "Generate revision"}
                    </button>
                  </div>
                </form>
              ) : null}

              <section className="ai-message-history" aria-label="Conversation messages">
                <header>
                  <MessageSquarePlus size={17} />
                  <h3>Conversation</h3>
                </header>
                {detail.messages.map((message) => (
                  <article className={message.role} key={message.id}>
                    <span>{message.role === "user" ? "You" : "Planner"}</span>
                    <p>{message.content || "Message detail expired under the retention policy."}</p>
                    <small>{readableTime(message.createdAt)}</small>
                  </article>
                ))}
                {!detail.messages.length ? <p>No messages yet.</p> : null}
              </section>

              <section className="ai-proposal-history" aria-label="Proposal revisions">
                <header>
                  <GitCompareArrows size={18} />
                  <h3>Proposal revisions</h3>
                </header>
                {detail.proposals.map((proposal) => (
                  <article className={`ai-proposal-card ${proposal.state}`} key={proposal.id}>
                    <header>
                      <div>
                        <span>Revision {proposal.revisionNumber}</span>
                        <strong>{proposal.summary || "Proposal detail expired"}</strong>
                      </div>
                      <b>{proposal.state}</b>
                    </header>
                    <details className="ai-revision-comparison">
                      <summary>Changes from the previous revision</summary>
                      <ProposalDiff diff={proposal.diff} />
                    </details>
                    {proposal.plan && "actions" in proposal.plan ? (
                      <AiActionReview plan={proposal.plan} />
                    ) : proposal.plan ? (
                      <div className="ai-proposal-tasks">
                        {proposal.plan.tasks.map((task) => (
                          <div key={task.tempId}>
                            <span>{task.taskType}</span>
                            <strong>{task.title}</strong>
                            <small>{task.acceptanceCriteria.length} acceptance criteria</small>
                            <p className="ai-ticket-description">{task.description}</p>
                            <ul>
                              {task.acceptanceCriteria.map((criterion, index) => (
                                <li key={index}>{criterion}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {proposal.evidenceSummary ? (
                      <div className="ai-proposal-evidence">
                        <strong>Evidence summary</strong>
                        <span>
                          {proposal.evidenceSummary.taskCount} tickets /{" "}
                          {proposal.evidenceSummary.githubCount} GitHub events
                        </span>
                        {proposal.evidenceSummary.items.map((item) => (
                          <small key={item.id}>{item.label}</small>
                        ))}
                      </div>
                    ) : null}
                    <footer>
                      <span>
                        <Clock3 size={14} /> Approval expires {readableTime(proposal.expiresAt)}
                      </span>
                      {proposal.canApprove && canEdit ? (
                        <div className="ai-approval-controls">
                          {proposal.plan && "actions" in proposal.plan ? (
                            <label className="ai-approval-confirmation">
                              <input
                                type="checkbox"
                                checked={confirmedProposal === proposal.id}
                                onChange={(event) =>
                                  setConfirmedProposal(event.target.checked ? proposal.id : "")
                                }
                              />
                              I reviewed all actions and approve these changes
                            </label>
                          ) : null}
                          <p className="ai-approval-help">
                            Apply this revision only after reviewing it. Approval changes the
                            project; generating a proposal does not.
                          </p>
                          <div className="ai-approval-buttons">
                            <button
                              className="button secondary danger"
                              disabled={busy !== null}
                              type="button"
                              onClick={() => void discard()}
                            >
                              <Trash2 size={15} /> {busy === "discard" ? "Discarding…" : "Discard"}
                            </button>
                            <button
                              className="button primary"
                              disabled={
                                busy !== null ||
                                Boolean(
                                  proposal.plan &&
                                  "actions" in proposal.plan &&
                                  confirmedProposal !== proposal.id
                                )
                              }
                              type="button"
                              onClick={() => void approve()}
                            >
                              <Check size={15} />{" "}
                              {busy === "approve"
                                ? "Applying…"
                                : proposal.plan && "actions" in proposal.plan
                                  ? "Approve and apply actions"
                                  : "Approve and create"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </footer>
                  </article>
                ))}
                {!detail.proposals.length ? <p>No proposal revisions yet.</p> : null}
              </section>

              <section className="ai-run-history" aria-label="AI run history">
                <header>
                  <History size={17} />
                  <h3>Run history</h3>
                </header>
                {detail.runs.map((runItem) => (
                  <div key={runItem.id}>
                    <b className={runItem.status}>{runItem.status}</b>
                    <span>{readableTime(runItem.startedAt)}</span>
                    <small>
                      {runItem.provider} / {runItem.model}
                    </small>
                    {runItem.errorCode ? <code>{runItem.errorCode}</code> : null}
                  </div>
                ))}
              </section>
            </>
          ) : (
            <div className="workspace-empty">
              <Bot size={28} />
              <h3>Select a conversation</h3>
              <p>Persistent messages, runs, and proposal revisions will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default ProjectAiConversations;
