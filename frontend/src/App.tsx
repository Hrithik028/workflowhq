import { lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { authApi } from "./api/auth";
import { LoadingExperience } from "./components/LoadingExperience";
import { PublicGlowContext } from "./public-glow-context";
import ProtectedRoute from "./components/ProtectedRoute";
import { demoCredentials } from "./demo/credentials";
import type { Session, User } from "./types";

import RouteContentBoundary from "./components/RouteContentBoundary";

const AppLayout = lazy(() => import("./components/AppLayout"));
const Calendar = lazy(() => import("./pages/Calendar"));
const ArchivePage = lazy(() => import("./pages/ArchivePage"));
const Login = lazy(() => import("./pages/Login"));
const Landing = lazy(() => import("./pages/Landing"));
const Overview = lazy(() => import("./pages/OverviewEngineering"));
const Projects = lazy(() => import("./pages/Projects"));
const Register = lazy(() => import("./pages/Register"));
const Settings = lazy(() => import("./pages/SettingsAdmin"));
const AiGovernance = lazy(() => import("./pages/AiGovernance"));
const GitHubIntegration = lazy(() => import("./pages/GitHubIntegration"));
const AiIntegrations = lazy(() => import("./pages/AiIntegrations"));
const InvitationPage = lazy(() => import("./pages/InvitationPage"));
const JiraImport = lazy(() => import("./pages/JiraImport"));
const Notifications = lazy(() => import("./pages/Notifications"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ProjectDevelopment = lazy(() => import("./pages/ProjectDevelopment"));
const ProjectAiConversations = lazy(() => import("./pages/ProjectAiConversations"));
const ProjectWorkflowSettings = lazy(() => import("./pages/ProjectWorkflowSettings"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const Tasks = lazy(() => import("./pages/TasksHierarchy"));
const Workspace = lazy(() => import("./pages/WorkspaceEngineering"));
const Analytics = lazy(() =>
  import("./pages/WorkspaceSections").then((module) => ({ default: module.Analytics }))
);
const Content = lazy(() =>
  import("./pages/WorkspaceSections").then((module) => ({ default: module.Content }))
);
const Inbox = lazy(() =>
  import("./pages/WorkspaceSections").then((module) => ({ default: module.Inbox }))
);
const Reports = lazy(() =>
  import("./pages/WorkspaceSections").then((module) => ({ default: module.Reports }))
);

const demoUser: User = {
  id: 1,
  name: "WorkFlowHQ Demo",
  email: demoCredentials.email,
  role: "user",
  createdAt: new Date().toISOString()
};

function App() {
  const isDemoBuild = import.meta.env.VITE_DEMO_MODE === "true";
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(!isDemoBuild);

  useEffect(() => {
    if (isDemoBuild) return;
    authApi
      .restore()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setIsCheckingAuth(false));
  }, [isDemoBuild]);

  const handleSession = (nextSession: Session) => {
    setIsDemo(false);
    setSession(nextSession);
  };

  const handleDemo = () => {
    setIsDemo(true);
    setSession({ accessToken: "demo", user: demoUser });
  };

  const handleLogout = async () => {
    if (!isDemo) await authApi.logout();
    setIsDemo(false);
    setSession(null);
  };

  const authenticated = Boolean(session);

  return (
    <PublicGlowContext.Provider value={!authenticated}>
      <LoadingExperience disabled={isCheckingAuth} />
      <RouteContentBoundary>
        <Routes>
          <Route path="/" element={<Landing authenticated={authenticated} />} />
          <Route
            path="/login"
            element={
              authenticated ? (
                <Navigate replace to="/app" />
              ) : (
                <Login onDemo={handleDemo} onSuccess={handleSession} />
              )
            }
          />
          <Route
            path="/register"
            element={
              authenticated ? (
                <Navigate replace to="/app" />
              ) : (
                <Register onDemo={handleDemo} onSuccess={handleSession} />
              )
            }
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route
            element={
              <ProtectedRoute isAuthenticated={authenticated} isChecking={isCheckingAuth}>
                <AppLayout isDemo={isDemo} onLogout={handleLogout} user={session?.user ?? null} />
              </ProtectedRoute>
            }
          >
            <Route path="/app" element={<Overview />} />
            <Route path="/workflow" element={<Workspace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id/development" element={<ProjectDevelopment />} />
            <Route path="/projects/:id/jira-import" element={<JiraImport />} />
            <Route path="/projects/:id/ai-conversations" element={<ProjectAiConversations />} />
            <Route path="/projects/:id/workflow-settings" element={<ProjectWorkflowSettings />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/content" element={<Content />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/archive" element={<ArchivePage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/ai-governance" element={<AiGovernance />} />
            <Route
              path="/settings/security"
              element={
                <SecuritySettings
                  onSignedOut={() => {
                    setIsDemo(false);
                    setSession(null);
                  }}
                />
              }
            />
            <Route path="/settings/integrations/github" element={<GitHubIntegration />} />
            <Route path="/settings/integrations/ai" element={<AiIntegrations />} />
            <Route path="/invitations/:token" element={<InvitationPage />} />
          </Route>
          <Route path="*" element={<Navigate replace to={authenticated ? "/app" : "/login"} />} />
        </Routes>
      </RouteContentBoundary>
    </PublicGlowContext.Provider>
  );
}

export default App;
