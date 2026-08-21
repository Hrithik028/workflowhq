import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { authApi } from "./api/auth";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Projects from "./pages/Projects";
import Register from "./pages/Register";
import Workspace from "./pages/Workspace";
import type { Session, User } from "./types";

const demoUser: User = {
  id: 1,
  name: "Alex Morgan",
  email: "alex@workflowhq.demo",
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
    <Routes>
      <Route
        path="/"
        element={
          authenticated ? (
            <Navigate replace to="/app" />
          ) : (
            <Login onDemo={handleDemo} onSuccess={handleSession} />
          )
        }
      />
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
      <Route
        element={
          <ProtectedRoute isAuthenticated={authenticated} isChecking={isCheckingAuth}>
            <AppLayout isDemo={isDemo} onLogout={handleLogout} user={session?.user ?? null} />
          </ProtectedRoute>
        }
      >
        <Route path="/app" element={<Workspace />} />
        <Route path="/projects" element={<Projects />} />
      </Route>
      <Route path="*" element={<Navigate replace to={authenticated ? "/app" : "/login"} />} />
    </Routes>
  );
}

export default App;
