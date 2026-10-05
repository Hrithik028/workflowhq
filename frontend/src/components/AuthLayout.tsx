import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePublicGlow } from "../public-glow-context";
import { ThemeToggle } from "../theme";
import BrandMark from "./BrandMark";
import PublicGlow from "./PublicGlow";

interface AuthLayoutProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
}

function AuthLayout({ children, eyebrow, title, copy }: AuthLayoutProps) {
  const showGlow = usePublicGlow();
  return (
    <main className={`auth-page editorial-auth${showGlow ? " auth-with-glow" : ""}`}>
      {showGlow ? <PublicGlow className="auth-ribbon" size={125} /> : null}
      <section className="auth-story" aria-label="WorkFlowHQ introduction">
        <header className="auth-story-masthead">
          <Link className="auth-brand" to="/" aria-label="WorkFlowHQ home"><span className="auth-brand-mark"><BrandMark width={25} height={25} /></span><span>WorkFlowHQ</span></Link>
          <ThemeToggle className="auth-theme-toggle" />
        </header>

        <div className="auth-story-message">
          <span>ONE CONSIDERED WORKSPACE</span>
          <h2>Make room for the<br /><em>work that matters.</em></h2>
          <p>Projects, tasks, and progress stay connected, so everyone can move with clarity.</p>
        </div>

        <footer className="auth-story-footer">
          <span>WorkFlowHQ</span>
          <span>Plan clearly. Move together.</span>
        </footer>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-card">
          <span className="overline">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="auth-intro">{copy}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

export default AuthLayout;
