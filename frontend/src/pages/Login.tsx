import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authApi } from "../api/auth";
import { getErrorMessage } from "../api/client";
import AuthLayout from "../components/AuthLayout";
import { demoCredentials } from "../demo/credentials";
import type { Session } from "../types";

interface LoginProps {
  onDemo: () => void;
  onSuccess: (session: Session) => void;
}

function Login({ onDemo, onSuccess }: LoginProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (
      email.trim().toLowerCase() === demoCredentials.email &&
      password === demoCredentials.password
    ) {
      onDemo();
      navigate("/app");
      return;
    }
    setIsSubmitting(true);
    try {
      onSuccess(await authApi.login({ email, password }));
      navigate("/app");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to sign in. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const enterDemo = () => {
    onDemo();
    navigate("/app");
  };

  const fillDemoCredentials = () => {
    setEmail(demoCredentials.email);
    setPassword(demoCredentials.password);
    setError("");
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
        {error ? <p className="form-alert error">{error}</p> : null}
        <button className="button primary wide" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting ? <ArrowRight size={17} /> : null}
        </button>
      </form>

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

      <p className="auth-switch">
        New to WorkflowHQ? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export default Login;
