import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
}

function AuthLayout({ children, eyebrow, title, copy }: AuthLayoutProps) {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="auth-brand" href="/" aria-label="WorkflowHQ home">
          <span className="brand-mark">W</span>
          <span>WorkflowHQ</span>
        </a>

        <div className="auth-story-copy">
          <span className="overline light">A calmer way to ship</span>
          <h1>Turn scattered work into a clear next move.</h1>
          <p>
            Plan projects, protect your focus, and keep every task moving without the weight of a
            complicated enterprise tool.
          </p>
          <ul>
            <li>
              <CheckCircle2 size={18} /> See the whole workflow at a glance
            </li>
            <li>
              <CheckCircle2 size={18} /> Keep projects and priorities connected
            </li>
            <li>
              <CheckCircle2 size={18} /> Make progress visible to the team
            </li>
          </ul>
        </div>

        <blockquote>
          “The best workflow is the one your team can understand in a minute.”
        </blockquote>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-card">
          <span className="overline">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="auth-intro">{copy}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

export default AuthLayout;
