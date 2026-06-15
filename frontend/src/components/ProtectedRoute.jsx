import { Navigate } from "react-router-dom";

function ProtectedRoute({ isAuthenticated, isCheckingAuth, children }) {
  if (isCheckingAuth) {
    return <div className="page-shell centered-shell">Checking your session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return children;
}

export default ProtectedRoute;

