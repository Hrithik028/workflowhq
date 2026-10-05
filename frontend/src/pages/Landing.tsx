import { ArrowRight, GitBranch, ListTodo, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

interface LandingProps {
  authenticated: boolean;
}

function Landing({ authenticated }: LandingProps) {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="landing-logo" to="/" aria-label="WorkflowHQ home">
          WORKFLOW<span>HQ</span>
        </Link>
        <nav aria-label="Landing navigation">
          <Link to={authenticated ? "/app" : "/login"}>
            {authenticated ? "Open workspace" : "Sign in"} <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <section className="landing-hero">
        <p className="landing-kicker">WORK / IN MOTION</p>
        <h1>From an idea to a shipped change.</h1>
        <p>
          Keep projects, tickets, GitHub activity and delivery decisions together in one clear
          place.
        </p>
        <div className="landing-actions">
          <Link className="button primary" to={authenticated ? "/app" : "/register"}>
            {authenticated ? "Go to your workspace" : "Get started"} <ArrowRight size={17} />
          </Link>
          {!authenticated && (
            <Link className="button secondary" to="/login">
              Sign in
            </Link>
          )}
        </div>
      </section>
      <section className="landing-features" aria-label="Product highlights">
        <article>
          <ListTodo size={24} />
          <h2>Plan the work</h2>
          <p>Organize issues, criteria and ownership.</p>
        </article>
        <article>
          <GitBranch size={24} />
          <h2>Follow development</h2>
          <p>Connect tickets to repository activity.</p>
        </article>
        <article>
          <ShieldCheck size={24} />
          <h2>Ship with control</h2>
          <p>Keep permissions and approvals visible.</p>
        </article>
      </section>
    </main>
  );
}

export default Landing;
