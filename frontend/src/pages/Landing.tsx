import { ArrowUp, ArrowUpRight, CalendarDays, CircleCheck, Layers3, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";

import BrandMark from "../components/BrandMark";
import FlowLines from "../components/FlowLines";
import PublicGlow from "../components/PublicGlow";
import { ThemeToggle } from "../theme";
import { useTheme } from "../theme-context";
import "./landing.css";

const steps = [
  { number: "01", title: "Create a project", copy: "Give the work a shared home. Add the people involved and keep the project context together.", icon: Layers3 },
  { number: "02", title: "Plan the tasks", copy: "Break the project into clear actions, assign owners, and set priorities and due dates.", icon: ListChecks },
  { number: "03", title: "Follow the work", copy: "Use the workflow and calendar to see what is moving, what is next, and what needs attention.", icon: CalendarDays },
  { number: "04", title: "See the progress", copy: "Review project status and completed work in one place, without collecting updates by hand.", icon: CircleCheck }
];

function Landing() {
  const { theme } = useTheme();

  return (
    <main className="landing-page" data-theme={theme} id="page-top">
      <header className="landing-header">
        <Link className="landing-logo" to="/" aria-label="WorkFlowHQ home">
          <span className="landing-logo-mark"><BrandMark width={26} height={26} /></span>
          <span>WorkFlowHQ</span>
        </Link>
        <nav className="landing-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a></nav>
        <div className="landing-header-actions">
          <ThemeToggle className="landing-theme-toggle" />
          <Link className="landing-signin" to="/login">Sign in</Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <PublicGlow className="landing-ribbon" hover={30} />
        <FlowLines theme={theme} />
        <div className="landing-hero-inner"><h1 id="landing-title">WorkFlowHQ</h1></div>
      </section>

      <section className="landing-process" id="how-it-works" aria-labelledby="how-it-works-title">
        <div className="landing-section-heading">
          <span className="landing-section-kicker">HOW IT WORKS</span>
          <h2 id="how-it-works-title">From project to progress.</h2>
          <p>WorkFlowHQ brings projects, tasks, deadlines, and progress into one clear workspace. Everyone can see what needs to happen next.</p>
        </div>
        <div className="landing-steps">
          <svg className="landing-journey-line" viewBox="0 0 1200 128" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="landing-journey-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop className="landing-journey-start" />
                <stop offset="1" className="landing-journey-end" />
              </linearGradient>
            </defs>
            <path d="M 0 64 C 75 64 75 26 150 64 C 250 112 350 16 450 64 C 550 112 650 16 750 64 C 850 112 950 16 1050 64 C 1125 101 1125 64 1200 64" stroke="url(#landing-journey-gradient)" strokeWidth="1.2" />
          </svg>
          {steps.map(({ number, title, copy, icon: Icon }) => (
            <article className="landing-step" key={number}>
              <span className="landing-step-marker" aria-hidden="true" />
              <div className="landing-step-meta"><span className="landing-step-number">{number} / 04</span><Icon size={22} strokeWidth={1.35} aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="landing-process-footer">
          <div className="landing-close-message">
            <span>NEXT STEP</span>
            <p>See how it feels<br /><em>to work with clarity.</em></p>
          </div>
          <div className="landing-close-actions">
            <Link to="/login"><span><small>01 / EXPLORE</small><strong>Explore the demo</strong></span><ArrowUpRight size={24} strokeWidth={1.4} aria-hidden="true" /></Link>
            <Link to="/register"><span><small>02 / BEGIN</small><strong>Get started</strong></span><ArrowUpRight size={24} strokeWidth={1.4} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-identity">
          <Link className="landing-footer-brand" to="/" aria-label="WorkFlowHQ home"><BrandMark width={21} height={21} /><span>WorkFlowHQ</span></Link>
          <span className="landing-footer-copyright">© {new Date().getFullYear()} WorkFlowHQ</span>
        </div>
        <nav className="landing-footer-nav" aria-label="Footer navigation">
          <a href="#how-it-works">How it works</a>
          <Link to="/login">Sign in</Link>
          <a className="landing-back-top" href="#page-top">Back to top <ArrowUp size={15} strokeWidth={1.6} aria-hidden="true" /></a>
        </nav>
      </footer>
    </main>
  );
}

export default Landing;
