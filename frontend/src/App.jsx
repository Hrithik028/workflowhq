import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import api, { clearStoredToken, getStoredToken } from "./api/api";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";

function App() {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const token = getStoredToken();

      if (!token) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const response = await api.get("/auth/me");
        setUser(response.data);
      } catch (error) {
        clearStoredToken();
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    restoreSession();
  }, []);

  const handleAuthSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
  };

  const isAuthenticated = Boolean(user);

  return (
    <div className="app-shell">
      <Navbar isAuthenticated={isAuthenticated} onLogout={handleLogout} user={user} />

      <Routes>
        <Route
          element={isAuthenticated ? <Navigate replace to="/dashboard" /> : <Register onAuthSuccess={handleAuthSuccess} />}
          path="/"
        />
        <Route
          element={isAuthenticated ? <Navigate replace to="/dashboard" /> : <Login onAuthSuccess={handleAuthSuccess} />}
          path="/login"
        />
        <Route
          element={
            isAuthenticated ? <Navigate replace to="/dashboard" /> : <Register onAuthSuccess={handleAuthSuccess} />
          }
          path="/register"
        />
        <Route
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} isCheckingAuth={isCheckingAuth}>
              <Dashboard user={user} />
            </ProtectedRoute>
          }
          path="/dashboard"
        />
      </Routes>
    </div>
  );
}

export default App;

