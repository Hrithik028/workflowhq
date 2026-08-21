import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: ReactNode;
  isAuthenticated: boolean;
  isChecking: boolean;
}

function ProtectedRoute({ children, isAuthenticated, isChecking }: ProtectedRouteProps) {
  if (isChecking) {
    return (
      <main className="loading-screen">
        <span className="brand-mark">W</span>
        <span className="loading-dot" />
        <p>Restoring your workspace…</p>
      </main>
    );
  }
  if (!isAuthenticated) return <Navigate replace to="/login" />;
  return children;
}

export default ProtectedRoute;
