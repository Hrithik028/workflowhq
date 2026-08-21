import { FolderKanban, LayoutDashboard, LogOut, Sparkles } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import type { User } from "../types";

export interface LayoutContext {
  isDemo: boolean;
  user: User;
}

interface AppLayoutProps {
  isDemo: boolean;
  onLogout: () => Promise<void>;
  user: User | null;
}

function AppLayout({ isDemo, onLogout, user }: AppLayoutProps) {
  if (!user) return null;

  return (
    <div className="product-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">W</span>
          <div>
            <strong>WorkflowHQ</strong>
            <span>Personal workspace</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink aria-label="Workspace" to="/app">
            <LayoutDashboard size={18} strokeWidth={2} />
            <span>Workspace</span>
          </NavLink>
          <NavLink aria-label="Projects" to="/projects">
            <FolderKanban size={18} strokeWidth={2} />
            <span>Projects</span>
          </NavLink>
        </nav>

        <div className="sidebar-focus-card">
          <Sparkles size={18} />
          <strong>Focus for today</strong>
          <p>Move one important task to done before adding more work.</p>
        </div>

        <div className="sidebar-account">
          <span className="avatar">{user.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <span>{isDemo ? "Preview workspace" : user.email}</span>
          </div>
          <button type="button" onClick={() => void onLogout()} aria-label="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="product-main">
        {isDemo ? (
          <div className="demo-banner">
            <span>Interactive preview</span>
            Changes stay in this browser session.
          </div>
        ) : null}
        <Outlet context={{ isDemo, user } satisfies LayoutContext} />
      </div>
    </div>
  );
}

export default AppLayout;
