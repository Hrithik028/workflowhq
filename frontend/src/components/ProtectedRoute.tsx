import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { DelayedLoadingScreen } from "./LoadingExperience";

interface ProtectedRouteProps {
  children: ReactNode;
  isAuthenticated: boolean;
  isChecking: boolean;
}

function ProtectedRoute({ children, isAuthenticated, isChecking }: ProtectedRouteProps) {
  const location = useLocation();
  if (isChecking) {
    return <DelayedLoadingScreen key={location.key} message="Restoring your workspace" />;
  }
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate replace to={`/login?next=${encodeURIComponent(returnTo)}`} />;
  }
  return children;
}

export default ProtectedRoute;
