import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function navLinkClass({ isActive }) {
  return `px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-brand/10 text-brand-dark"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
  }`;
}

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6 flex-wrap">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-brand text-white grid place-items-center font-bold">
              C
            </span>
            <span className="font-semibold text-lg">CarbonLens 2.0</span>
          </Link>

          {isAuthenticated && (
            <nav className="flex items-center gap-1 flex-wrap">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/agent" className={navLinkClass}>
                AI Agent
              </NavLink>
              <NavLink to="/simulator" className={navLinkClass}>
                What-if Simulator
              </NavLink>
              <NavLink to="/optimization" className={navLinkClass}>
                Website Optimization
              </NavLink>
            </nav>
          )}
        </div>

        <nav className="flex items-center gap-4 text-sm">
          {isAuthenticated ? (
            <>
              <span className="text-slate-600 hidden sm:inline">
                {user?.email || "Account"}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-slate-700 hover:text-slate-900">
                Login
              </Link>
              <Link
                to="/register"
                className="px-3 py-1.5 rounded-md bg-brand text-white hover:bg-brand-dark"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
