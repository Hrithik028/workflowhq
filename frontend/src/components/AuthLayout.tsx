import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
}

function AuthLayout({ children, eyebrow, title, copy }: AuthLayoutProps) {
  const issueNumber = String(new Date().getDate()).padStart(2, "0");
  const dateLabel = new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  })
    .format(new Date())
    .toUpperCase();

  return (
    <main className="auth-page editorial-auth">
      <section className="auth-story" aria-label="WorkflowHQ introduction">
        <header className="auth-story-masthead">
          <a className="auth-brand" href="/" aria-label="WorkflowHQ home">
            WORKFLOW<span>HQ</span>
          </a>
          <div className="auth-edition">
            <span>{dateLabel}</span>
            <strong>INDEX {issueNumber}</strong>
          </div>
        </header>

        <div className="auth-type-wall" aria-hidden="true">
          <span>WORK</span>
          <span>FLOW</span>
          <span>HQ</span>
        </div>

        <footer className="auth-story-footer">
          <div className="auth-product-promise">
            <strong>Plan the work. See what’s moving. Ship what matters.</strong>
            <p>One clear workspace for projects, tasks, deadlines, and delivery progress.</p>
          </div>
          <span>PROJECTS / TASKS / DEADLINES / PROGRESS</span>
        </footer>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-card">
          <div className="auth-form-index">
            <span>ACCESS / {issueNumber}</span>
            <span className="auth-system-status">
              <i /> System online
            </span>
          </div>

          <span className="overline">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="auth-intro">{copy}</p>
          {children}

          <div className="auth-live-strip" aria-label="Example workspace summary">
            <span>
              <i /> Live workspace
            </span>
            <strong>18 tasks</strong>
            <strong>6 moving</strong>
            <strong>6 shipped</strong>
            <ArrowUpRight size={14} />
          </div>
        </div>
      </section>
    </main>
  );
}

export default AuthLayout;
