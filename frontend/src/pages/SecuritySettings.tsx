import {
  Copy,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  ShieldOff,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { authApi } from "../api/auth";
import { getErrorMessage } from "../api/client";
import type { AccountSession, MfaStatus } from "../types";

interface SecuritySettingsProps {
  onSignedOut: () => void;
}

function SecuritySettings({ onSignedOut }: SecuritySettingsProps) {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [mfa, setMfa] = useState<MfaStatus | null>(null);
  const [mfaUnavailable, setMfaUnavailable] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [nextSessions, nextMfa] = await Promise.all([
      authApi.getSessions(),
      authApi.getMfaStatus()
    ]);
    setSessions(nextSessions);
    setMfa(nextMfa);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([authApi.getSessions(), authApi.getMfaStatus()]).then(
      ([sessionResult, mfaResult]) => {
        if (!active) return;
        if (sessionResult.status === "fulfilled") setSessions(sessionResult.value);
        else setError(getErrorMessage(sessionResult.reason, "Unable to load active sessions."));
        if (mfaResult.status === "fulfilled") setMfa(mfaResult.value);
        else setMfaUnavailable(true);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "The security change could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  const startSetup = (event: FormEvent) => {
    event.preventDefault();
    void run(
      async () => setSetup(await authApi.startMfaSetup(password)),
      "Authenticator setup started."
    );
  };

  const enable = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await authApi.enableMfa(code);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setPassword("");
      setCode("");
      await load();
    }, "Multi-factor authentication is enabled.");
  };

  const disable = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await authApi.disableMfa(password, code);
      setPassword("");
      setCode("");
      setRecoveryCodes([]);
      await load();
    }, "Multi-factor authentication is disabled.");
  };

  const revoke = (session: AccountSession) => {
    void run(
      async () => {
      await authApi.revokeSession(session.id);
      if (session.current) {
        authApi.forgetLocalSession();
        onSignedOut();
          return;
        }
        await load();
      },
      session.current ? "Current session closed." : "Session revoked."
    );
  };

  return (
    <main className="workspace-page security-settings-page">
      <header className="engineering-page-header security-page-header">
        <div>
          <span className="overline">Settings / Security</span>
          <h1>Account security</h1>
          <p>Protect your account with a second factor and control every active sign-in.</p>
        </div>
        <Link className="button secondary" to="/settings">
          Rules &amp; access
        </Link>
      </header>

      {error ? <p className="admin-notice error">{error}</p> : null}
      {notice ? <p className="admin-notice success">{notice}</p> : null}

      <section className="security-grid">
        <article className="security-panel">
          <header>
            <ShieldCheck size={24} />
            <div>
              <span className="overline">Authentication</span>
              <h2>Authenticator app</h2>
            </div>
          </header>
          <p>Use a time-based code from your authenticator app in addition to your password.</p>
          {mfaUnavailable ? (
            <p className="form-alert notice">
              Authenticator MFA is not configured on this deployment. Active-session controls are
              still available.
            </p>
          ) : mfa?.enabled ? (
            <>
              <div className="security-state enabled">
                <ShieldCheck size={18} /> Enabled · {mfa.recoveryCodesRemaining} recovery codes
                remain
              </div>
              <form className="security-form" onSubmit={disable}>
                <label>
                  <span>Current password</span>
                  <input
                    autoComplete="current-password"
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                </label>
                <label>
                  <span>Authenticator or recovery code</span>
                  <input
                    autoComplete="one-time-code"
                    onChange={(event) => setCode(event.target.value)}
                    required
                    value={code}
                  />
                </label>
                <button className="button secondary" disabled={busy} type="submit">
                  <ShieldOff size={16} /> Disable MFA
                </button>
              </form>
            </>
          ) : setup ? (
            <form className="security-form" onSubmit={enable}>
              <div className="security-secret">
                <strong>Manual setup key</strong>
                <code>{setup.secret}</code>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(setup.secret)}
                >
                  <Copy size={14} /> Copy key
                </button>
              </div>
              <p className="security-note">
                Add the key to any TOTP authenticator, then enter its six-digit code. The setup URI
                is also available for advanced clients.
              </p>
              <details>
                <summary>Show authenticator URI</summary>
                <code className="security-uri">{setup.otpAuthUri}</code>
              </details>
              <label>
                <span>Six-digit code</span>
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  onChange={(event) => setCode(event.target.value)}
                  required
                  value={code}
                />
              </label>
              <button className="button primary" disabled={busy} type="submit">
                <KeyRound size={16} /> Verify and enable
              </button>
            </form>
          ) : (
            <form className="security-form" onSubmit={startSetup}>
              <label>
                <span>Confirm your password</span>
                <input
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <button className="button primary" disabled={busy || mfa === null} type="submit">
                <KeyRound size={16} /> Set up MFA
              </button>
            </form>
          )}
          {recoveryCodes.length ? (
            <section className="recovery-code-panel" aria-live="polite">
              <h3>Save these recovery codes now</h3>
              <p>Each code works once. They will not be shown again.</p>
              <div className="recovery-code-grid">
                {recoveryCodes.map((recoveryCode) => (
                  <code key={recoveryCode}>{recoveryCode}</code>
                ))}
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() => void navigator.clipboard.writeText(recoveryCodes.join("\n"))}
              >
                <Copy size={15} /> Copy all codes
              </button>
            </section>
          ) : null}
        </article>

        <article className="security-panel">
          <header>
            <MonitorSmartphone size={24} />
            <div>
              <span className="overline">Access</span>
              <h2>Active sessions</h2>
            </div>
          </header>
          <p>Review browsers and devices that can currently access your account.</p>
          <div className="session-list">
            {sessions.map((session) => (
              <div className="session-row" key={session.id}>
                <MonitorSmartphone size={18} />
                <div>
                  <strong>
                    {session.current ? "This device" : session.userAgent || "Unknown device"}
                  </strong>
                  <span>
                    {session.ipAddress || "IP unavailable"} · active{" "}
                    {new Date(session.lastUsedAt).toLocaleString()}
                  </span>
                </div>
                <button
                  aria-label={`Revoke ${session.current ? "this device" : "session"}`}
                  className="icon-button"
                  disabled={busy}
                  onClick={() => revoke(session)}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="button danger"
            disabled={busy || sessions.length === 0}
            type="button"
            onClick={() =>
              void run(async () => {
                await authApi.revokeAllSessions();
                onSignedOut();
              }, "All sessions closed.")
            }
          >
            <LogOut size={16} /> Sign out everywhere
          </button>
        </article>
      </section>
    </main>
  );
}

export default SecuritySettings;
