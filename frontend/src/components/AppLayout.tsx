import {
  BarChart3,
  CalendarDays,
  Columns3,
  FileText,
  Inbox,
  LayoutDashboard,
  ListTodo,
  LogOut,
  PieChart,
  Settings
} from "lucide-react";
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
          <span className="sidebar-wordmark brand-mark" aria-label="WorkflowHQ">
            <b aria-hidden="true">W</b>
            <b aria-hidden="true">HQ</b>
          </span>
          <div>
            <strong>WorkflowHQ</strong>
            <span>Work management / 01</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink aria-label="Overview" to="/app">
            <LayoutDashboard size={18} strokeWidth={2} />
            <span>Overview</span>
          </NavLink>
          <NavLink aria-label="Workflow" to="/workflow">
            <Columns3 size={18} strokeWidth={2} />
            <span>Workflow</span>
          </NavLink>
          <NavLink aria-label="Calendar" to="/calendar">
            <CalendarDays size={18} strokeWidth={2} />
            <span>Calendar</span>
          </NavLink>
          <NavLink aria-label="Tasks" to="/tasks">
            <ListTodo size={18} strokeWidth={2} />
            <span>Tasks</span>
          </NavLink>
          <NavLink aria-label="Content" to="/content">
            <FileText size={18} strokeWidth={2} />
            <span>Content</span>
          </NavLink>
          <NavLink aria-label="Analytics" to="/analytics">
            <BarChart3 size={18} strokeWidth={2} />
            <span>Analytics</span>
          </NavLink>
          <NavLink aria-label="Reports" to="/reports">
            <PieChart size={18} strokeWidth={2} />
            <span>Reports</span>
          </NavLink>
          <NavLink aria-label="Inbox" to="/inbox">
            <Inbox size={18} strokeWidth={2} />
            <span>Inbox</span>
          </NavLink>
          <NavLink aria-label="Settings" to="/settings">
            <Settings size={18} strokeWidth={2} />
            <span>Settings</span>
          </NavLink>
        </nav>

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
