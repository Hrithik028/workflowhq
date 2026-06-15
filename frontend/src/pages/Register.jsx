import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import api, { setStoredToken } from "../api/api";

function Register({ onAuthSuccess }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });
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
      const response = await api.post("/auth/register", formData);
      setStoredToken(response.data.token);
      onAuthSuccess(response.data.user);
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create an account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Portfolio MVP</p>
        <h1>Create your account</h1>
        <p className="auth-copy">
          Register to create tasks, track workflow progress, and test the authenticated product flow.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input name="name" onChange={handleChange} value={formData.name} />
          </label>

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
            {isSubmitting ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}

export default Register;

