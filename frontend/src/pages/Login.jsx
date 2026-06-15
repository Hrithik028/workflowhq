import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api, { setStoredToken } from "../api/api";

function Login({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await api.post("/auth/login", formData);
      setStoredToken(response.data.token);
      onAuthSuccess(response.data.user);
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to log in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to your workflow dashboard</h1>
        <p className="auth-copy">
          Manage your tasks, review progress, and keep your work organized in one clean interface.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input name="email" onChange={handleChange} type="email" value={formData.email} />
          </label>

          <label>
            Password
            <input name="password" onChange={handleChange} type="password" value={formData.password} />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="auth-switch">
          Need an account? <Link to="/register">Create one</Link>
        </p>
      </section>
    </main>
  );
}

export default Login;

