import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { authApi } from "../api/auth";
import { getErrorCode, getErrorMessage } from "../api/client";
import AuthLayout from "../components/AuthLayout";
import { demoCredentials } from "../demo/credentials";
import type { Session } from "../types";

interface LoginProps {
  onDemo: () => void;
  onSuccess: (session: Session) => void;
  allowDemo?: boolean;
  registerPath?: string;
  successPath?: string;
}

function Login({ onDemo, onSuccess, allowDemo = true, registerPath, successPath }: LoginProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = new URLSearchParams(location.search).get("next");
  const safeRequestedPath =
    requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : null;
  const demoEnabled = allowDemo && !safeRequestedPath?.startsWith("/invitations/");
  const destination = successPath || safeRequestedPath || "/app";
  const createAccountPath =
    registerPath ||
    (safeRequestedPath ? `/register?next=${encodeURIComponent(safeRequestedPath)}` : "/register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setVerificationRequired(false);
    if (
      demoEnabled &&
      email.trim().toLowerCase() === demoCredentials.email &&
      password === demoCredentials.password
    ) {
      onDemo();
      navigate(destination);
      return;
    }
    setIsSubmitting(true);
    try {
      if (mfaChallenge) {
        onSuccess(await authApi.verifyMfa(mfaChallenge, mfaCode));
        navigate(destination);
        return;
      }
      const result = await authApi.login({ email, password });
      if (result.type === "mfa") {
        setMfaChallenge(result.challengeToken);
        setPassword("");
        return;
      }
      onSuccess(result.session);
      navigate(destination);
    } catch (requestError) {
      setVerificationRequired(getErrorCode(requestError) === "EMAIL_VERIFICATION_REQUIRED");
      setError(getErrorMessage(requestError, "Unable to sign in. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const enterDemo = () => {
    onDemo();
    navigate(destination);
  };

  const fillDemoCredentials = () => {
    setEmail(demoCredentials.email);
    setPassword(demoCredentials.password);
    setError("");
    setVerificationRequired(false);
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to your workspace"
      copy="WorkflowHQ brings projects, tasks, deadlines, and delivery progress into one clear workspace."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>Email address</span>
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          <span>Password</span>
          <span className="password-field">
            <input
              autoComplete="current-password"
              minLength={8}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              disabled={Boolean(mfaChallenge)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
        {mfaChallenge ? (
          <label>
            <span>Authentication code</span>
            <input
              autoComplete="one-time-code"
              autoFocus
              inputMode="numeric"
              name="mfa-code"
              onChange={(event) => setMfaCode(event.target.value)}
              placeholder="6-digit code or recovery code"
              required
              value={mfaCode}
            />
          </label>
        ) : null}
        {error ? <p className="form-alert error">{error}</p> : null}
        <button className="button primary wide" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Checking…" : mfaChallenge ? "Verify and sign in" : "Sign in"}
          {!isSubmitting ? <ArrowRight size={17} /> : null}
        </button>
      </form>

      {!mfaChallenge ? (
        <p className="auth-help-link">
          <Link to="/forgot-password">Forgot your password?</Link>
          {verificationRequired ? (
            <>
              {" · "}
              <Link to="/verify-email">Resend verification</Link>
            </>
          ) : null}
        </p>
      ) : (
        <button
          className="text-link auth-help-link"
          type="button"
          onClick={() => {
            setMfaChallenge(null);
            setMfaCode("");
          }}
        >
          Use a different account
        </button>
      )}

      {demoEnabled ? (
        <section className="demo-login-card" aria-label="Demo login">
          <header>
            <strong>Demo account</strong>
            <span>Populated workspace</span>
          </header>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{demoCredentials.email}</dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>{demoCredentials.password}</dd>
            </div>
          </dl>
          <div className="demo-login-actions">
            <button className="text-link" type="button" onClick={fillDemoCredentials}>
              Fill credentials
            </button>
            <button className="button secondary" type="button" onClick={enterDemo}>
              Enter demo <ArrowRight size={15} />
            </button>
          </div>
          <p>Includes projects, task hierarchy, deadlines, activity, and delivery metrics.</p>
        </section>
      ) : null}

      <p className="auth-switch">
        New to WorkflowHQ? <Link to={createAccountPath}>Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export default Login;
