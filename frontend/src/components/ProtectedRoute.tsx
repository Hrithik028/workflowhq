import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  children: ReactNode;
  isAuthenticated: boolean;
  isChecking: boolean;
}

function ProtectedRoute({ children, isAuthenticated, isChecking }: ProtectedRouteProps) {
  const location = useLocation();
  if (isChecking) {
    return (
      <main className="loading-screen">
        <span className="brand-mark">W</span>
        <span className="loading-dot" />
        <p>Restoring your workspace…</p>
      </main>
    );
  }
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate replace to={`/login?next=${encodeURIComponent(returnTo)}`} />;
  }
  return children;
}

export default ProtectedRoute;
