import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { authApi } from "../api/auth";
import { getErrorMessage } from "../api/client";
import AuthLayout from "../components/AuthLayout";

function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"checking" | "verified" | "error">(
    token ? "checking" : "error"
  );
  const [message, setMessage] = useState(token ? "" : "This verification link is incomplete.");
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    authApi
      .verifyEmail(token)
      .then(() => active && setState("verified"))
      .catch((error) => {
        if (!active) return;
        setMessage(getErrorMessage(error, "This verification link is invalid or expired."));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [token]);

  const requestAnother = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await authApi.requestEmailVerification(email);
      setRequested(true);
      setMessage("");
    } catch (error) {
      setMessage(getErrorMessage(error, "Unable to request another verification email."));
    }
  };

  return (
    <AuthLayout
      eyebrow="Email verification"
      title={state === "verified" ? "Email verified" : "Verify your account"}
      copy="WorkflowHQ verifies account ownership before allowing access."
    >
      <section className="auth-confirmation" aria-live="polite">
        {state === "checking" ? <p>Checking your verification link…</p> : null}
        {state === "verified" ? (
          <>
            <h2>You are ready to work.</h2>
            <p>Your email address is confirmed.</p>
            <Link className="button primary wide" to="/login">
              Sign in
            </Link>
          </>
        ) : null}
        {state === "error" ? (
          <>
            <p className="form-alert error">{message}</p>
            {!token ? (
              requested ? (
                <p>If that account still requires verification, a new email has been sent.</p>
              ) : (
                <form className="auth-form" onSubmit={requestAnother}>
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
                  <button className="button primary wide" type="submit">
                    Send another verification email
                  </button>
                </form>
              )
            ) : null}
            <Link className="button secondary wide" to="/login">
              Return to sign in
            </Link>
          </>
        ) : null}
      </section>
    </AuthLayout>
  );
}

export default VerifyEmail;
