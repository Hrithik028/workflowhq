import { AlertTriangle, Link2, RotateCcw, ShieldCheck, Unlink, UserRoundSearch } from "lucide-react";

import type {
  GitHubActorIdentity,
  GitHubIdentityDirectory,
  GitHubWebhookFailure
} from "../types";
import { formatRelativeTime } from "../utils/format";

interface GitHubOperationsPanelsProps {
  busyKey: string;
  failures: GitHubWebhookFailure[];
  identityDirectory: GitHubIdentityDirectory;
  identityDrafts: Record<string, string>;
  onIdentityDraft: (actor: GitHubActorIdentity, userId: string) => void;
  onMapIdentity: (actor: GitHubActorIdentity) => void;
  onRemoveIdentity: (actor: GitHubActorIdentity) => void;
  onRetryDelivery: (delivery: GitHubWebhookFailure) => void;
  readOnly?: boolean;
}

const actorKey = (actor: GitHubActorIdentity) =>
  `${actor.installationId}:${actor.actorLogin.toLowerCase()}`;

const canMapActor = (login: string) =>
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login);

function GitHubOperationsPanels({
  busyKey,
  failures,
  identityDirectory,
  identityDrafts,
  onIdentityDraft,
  onMapIdentity,
  onRemoveIdentity,
  onRetryDelivery,
  readOnly = false
}: GitHubOperationsPanelsProps) {
  return (
    <div className="github-operations-grid">
      <section className="github-identity-register" aria-label="GitHub identity mapping">
        <header>
          <div>
            <span className="overline">Contributor identity</span>
            <h2>Match GitHub actors to members</h2>
          </div>
          <p>Mapped activity uses the member’s WorkflowHQ name while retaining the GitHub login.</p>
        </header>

        {identityDirectory.actors.length ? (
          <div className="github-identity-list">
            {identityDirectory.actors.map((actor) => {
              const key = actorKey(actor);
              const members = identityDirectory.members.filter(
                (member) => member.installationId === actor.installationId
              );
              const busy = busyKey === `identity-${key}`;
              const mappable = canMapActor(actor.actorLogin);
              return (
                <article key={key} className={actor.mapping ? "mapped" : ""}>
                  <div className="github-actor-name">
                    <UserRoundSearch size={19} />
                    <span>
                      <strong>@{actor.actorLogin}</strong>
                      <small>
                        {actor.accountLogin} · {actor.eventCount} event
                        {actor.eventCount === 1 ? "" : "s"} · last seen{" "}
                        {formatRelativeTime(actor.lastSeenAt)}
                      </small>
                    </span>
                  </div>
                  <label>
                    WorkflowHQ member
                    <select
                      aria-label={`Member for ${actor.actorLogin}`}
                      disabled={readOnly || busy || !mappable}
                      onChange={(event) => onIdentityDraft(actor, event.target.value)}
                      value={identityDrafts[key] || ""}
                    >
                      <option value="">Choose a member</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name} — {member.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="github-identity-state">
                    {actor.mapping ? (
                      <>
                        <ShieldCheck size={16} />
                        <span>
                          <strong>{actor.mapping.mappedUserName}</strong>
                          <small>Verified member mapping</small>
                        </span>
                      </>
                    ) : (
                      <span>
                        <strong>{mappable ? "Unmapped" : "Automation account"}</strong>
                        <small>
                          {mappable
                            ? "Activity remains attributed to the GitHub login."
                            : "Bot accounts cannot impersonate workspace members."}
                        </small>
                      </span>
                    )}
                  </div>
                  <div className="github-identity-actions">
                    {actor.mapping ? (
                      <button
                        className="button secondary"
                        disabled={readOnly || busy}
                        onClick={() => onRemoveIdentity(actor)}
                        type="button"
                      >
                        <Unlink size={14} /> Remove
                      </button>
                    ) : null}
                    <button
                      className="button primary"
                      disabled={readOnly || busy || !mappable || !identityDrafts[key]}
                      onClick={() => onMapIdentity(actor)}
                      type="button"
                    >
                      <Link2 size={14} /> {busy ? "Saving…" : actor.mapping ? "Update" : "Map"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="github-operations-empty">
            <UserRoundSearch size={24} />
            <p>Contributor identities appear after verified GitHub activity is synchronized.</p>
          </div>
        )}
      </section>

      <section className="github-recovery-register" aria-label="Failed GitHub deliveries">
        <header>
          <div>
            <span className="overline">Webhook recovery</span>
            <h2>Failed deliveries</h2>
          </div>
          <p>WorkflowHQ stores only a receipt. Recovery asks GitHub to resend the signed original.</p>
        </header>

        {failures.length ? (
          <div className="github-failure-list">
            {failures.map((delivery) => {
              const busy = busyKey === `delivery-${delivery.id}`;
              const blockedLabel =
                delivery.redeliveryBlockedReason === "expired"
                  ? "Window expired"
                  : delivery.redeliveryBlockedReason === "limit_reached"
                    ? "Limit reached"
                    : delivery.redeliveryBlockedReason === "cooldown"
                      ? "Wait one minute"
                      : null;
              return (
                <article key={delivery.id}>
                  <AlertTriangle size={19} />
                  <div>
                    <strong>
                      {delivery.eventName}
                      {delivery.eventAction ? ` / ${delivery.eventAction}` : ""}
                    </strong>
                    <p>{delivery.errorMessage}</p>
                    <small>
                      {delivery.accountLogin} · received {formatRelativeTime(delivery.receivedAt)} ·{" "}
                      {delivery.attemptCount} processing attempt
                      {delivery.attemptCount === 1 ? "" : "s"}
                      {delivery.redeliveryRequestedAt
                        ? ` · redelivery requested ${formatRelativeTime(delivery.redeliveryRequestedAt)}`
                        : ""}
                    </small>
                  </div>
                  <button
                    className="button secondary"
                    disabled={readOnly || busy || !delivery.redeliveryAvailable}
                    onClick={() => onRetryDelivery(delivery)}
                    type="button"
                  >
                    <RotateCcw size={14} />
                    {busy
                      ? "Requesting…"
                      : blockedLabel || "Ask GitHub to redeliver"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="github-operations-empty healthy">
            <ShieldCheck size={24} />
            <p>No failed webhook deliveries need attention.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default GitHubOperationsPanels;
