import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { authApi } from "../api/auth";
import { getErrorMessage } from "../api/client";
import AuthLayout from "../components/AuthLayout";

function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError("This password-reset link is incomplete.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await authApi.resetPassword(token, password);
      setComplete(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "This reset link is invalid or expired."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Choose a new password"
      copy="Reset links work once. Signing in again will be required on every device."
    >
      {complete ? (
        <section className="auth-confirmation" aria-live="polite">
          <h2>Password updated.</h2>
          <p>Your previous sessions have been closed.</p>
          <Link className="button primary wide" to="/login">
            Sign in <ArrowRight size={17} />
          </Link>
        </section>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>New password</span>
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="form-alert error">{error}</p> : null}
          <button className="button primary wide" disabled={submitting || !token} type="submit">
            {submitting ? "Updating…" : "Update password"} <ArrowRight size={17} />
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export default ResetPassword;
