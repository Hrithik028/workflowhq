import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { authApi } from "../api/auth";
import { getErrorMessage } from "../api/client";
import AuthLayout from "../components/AuthLayout";
import type { Session } from "../types";

interface RegisterProps {
  onDemo: () => void;
  onSuccess: (session: Session) => void;
  loginPath?: string;
  successPath?: string;
}

function Register({
  onDemo,
  onSuccess,
  loginPath,
  successPath
}: RegisterProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = new URLSearchParams(location.search).get("next");
  const safeRequestedPath =
    requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : null;
  const destination = successPath || safeRequestedPath || "/app";
  const signInPath =
    loginPath ||
    (safeRequestedPath ? `/login?next=${encodeURIComponent(safeRequestedPath)}` : "/login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      onSuccess(await authApi.register(form));
      navigate(destination);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to create your account."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Start with clarity"
      title="Create your workspace"
      copy="Bring projects, tasks, deadlines, and delivery progress into one clear workspace."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>Full name</span>
          <input
            autoComplete="name"
            onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
            placeholder="Alex Morgan"
            required
            value={form.name}
          />
        </label>
        <label>
          <span>Email address</span>
          <input
            autoComplete="email"
            onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
            placeholder="you@example.com"
            required
            type="email"
            value={form.email}
          />
        </label>
        <label>
          <span>Password</span>
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))}
            placeholder="At least 8 characters"
            required
            type="password"
            value={form.password}
          />
        </label>
        {error ? <p className="form-alert error">{error}</p> : null}
        <button className="button primary wide" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating workspace…" : "Create account"}
          {!isSubmitting ? <ArrowRight size={17} /> : null}
        </button>
      </form>

      {import.meta.env.VITE_DEMO_MODE === "true" ? (
        <button
          className="text-link demo-link"
          type="button"
          onClick={() => {
            onDemo();
            navigate("/app");
          }}
        >
          Preview the workspace first
        </button>
      ) : null}
      <p className="auth-switch">
        Already have an account? <Link to={signInPath}>Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export default Register;
