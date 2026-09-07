import { ArrowRight, Check, Clock3, Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { invitationApi } from "../api/invitations";
import type { ProjectInvitation } from "../types";

function InvitationPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<ProjectInvitation | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<"accept" | "decline" | null>(null);

  const loadInvitation = useCallback(async () => {
    setIsLoading(true);
    try {
      setInvitation(await invitationApi.inspect(token));
      setError("");
    } catch (loadError) {
      setInvitation(null);
      setError(getErrorMessage(loadError, "This invitation could not be opened."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInvitation(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInvitation]);

  const accept = async () => {
    setAction("accept");
    try {
      const result = await invitationApi.accept(token);
      navigate(`/workflow?project=${result.projectId}`, { replace: true });
    } catch (acceptError) {
      setError(getErrorMessage(acceptError, "Unable to accept this invitation."));
      setAction(null);
    }
  };

  const decline = async () => {
    setAction("decline");
    try {
      await invitationApi.decline(token);
      navigate("/app", { replace: true });
    } catch (declineError) {
      setError(getErrorMessage(declineError, "Unable to decline this invitation."));
      setAction(null);
    }
  };

  return (
    <main className="invitation-page">
      <header className="engineering-page-header invitation-page-header">
        <div>
          <span className="overline">Workspace / Invitation</span>
          <h1>Join the project.</h1>
          <p>Review the access you were offered before it changes your workspace.</p>
        </div>
      </header>

      <section className="invitation-panel" aria-live="polite">
        {isLoading ? (
          <div className="invitation-state">
            <Clock3 aria-hidden="true" />
            <h2>Checking your invitation…</h2>
            <p>We are validating the secure link and the email on your signed-in account.</p>
          </div>
        ) : error || !invitation ? (
          <div className="invitation-state error-state">
            <X aria-hidden="true" />
            <span className="overline">Invitation unavailable</span>
            <h2>This link cannot be accepted.</h2>
            <p>{error || "The invitation is invalid or no longer active."}</p>
            <button className="button secondary" onClick={() => navigate("/app")} type="button">
              Return to overview
            </button>
          </div>
        ) : (
          <>
            <div className="invitation-summary">
              <span className="invitation-icon"><UserPlus aria-hidden="true" /></span>
              <div>
                <span className="overline">Project access</span>
                <h2>{invitation.projectName}</h2>
                <p>{invitation.projectKey} · {invitation.role === "editor" ? "Editor" : "Viewer"}</p>
              </div>
            </div>

            <dl className="invitation-details">
              <div>
                <dt><Mail size={15} /> Invited email</dt>
                <dd>{invitation.email}</dd>
              </div>
              <div>
                <dt><ShieldCheck size={15} /> Access level</dt>
                <dd>{invitation.role === "editor" ? "Can create and update project work" : "Can view project work"}</dd>
              </div>
              <div>
                <dt><UserPlus size={15} /> Invited by</dt>
                <dd>{invitation.invitedByName || "A WorkflowHQ project owner"}</dd>
              </div>
              <div>
                <dt><Clock3 size={15} /> Link expires</dt>
                <dd>{new Date(invitation.expiresAt).toLocaleString()}</dd>
              </div>
            </dl>

            {error ? <p className="form-alert error">{error}</p> : null}
            <p className="invitation-security-note">
              <Check size={16} /> This invitation only works for the exact email shown above.
            </p>
            <footer className="invitation-actions">
              <button className="button secondary" disabled={action !== null} onClick={() => void decline()} type="button">
                {action === "decline" ? "Declining…" : "Decline"}
              </button>
              <button className="button primary" disabled={action !== null} onClick={() => void accept()} type="button">
                {action === "accept" ? "Joining…" : "Accept and join"}
                {action !== "accept" ? <ArrowRight size={16} /> : null}
              </button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

export default InvitationPage;
