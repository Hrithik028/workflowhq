import { Link } from "react-router-dom";

function Navbar({ user, isAuthenticated, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <Link className="brand" to={isAuthenticated ? "/dashboard" : "/"}>
          Task Workflow Platform
        </Link>
        <p className="brand-subtitle">Portfolio-ready task management with auth, filters, and stats.</p>
      </div>

      <nav className="nav-actions">
        {isAuthenticated ? (
          <>
            <span className="nav-user">Hi, {user?.name || "Developer"}</span>
            <button className="secondary-button" onClick={onLogout} type="button">
              Logout
            </button>
          </>
        ) : (
          <>
            <Link className="secondary-button link-button" to="/login">
              Login
            </Link>
            <Link className="primary-button link-button" to="/register">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export default Navbar;

