import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { authApi } from "../api/auth";
import { getErrorMessage } from "../api/client";
import AuthLayout from "../components/AuthLayout";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await authApi.requestPasswordReset(email);
      setSent(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to request a password reset."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Reset your password"
      copy="Request a secure, single-use reset link for your WorkflowHQ account."
    >
      {sent ? (
        <section className="auth-confirmation" aria-live="polite">
          <h2>Check your inbox.</h2>
          <p>
            If an account exists for <strong>{email}</strong>, a password-reset link is on its way.
          </p>
          <Link className="button secondary wide" to="/login">
            Return to sign in
          </Link>
        </section>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email address</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          {error ? <p className="form-alert error">{error}</p> : null}
          <button className="button primary wide" disabled={submitting} type="submit">
            {submitting ? "Sending…" : "Send reset link"} <ArrowRight size={17} />
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export default ForgotPassword;
