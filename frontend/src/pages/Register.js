import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../services/authService";
import { getApiErrorMessage } from "../utils/apiError";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/login", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h1 className="text-2xl font-semibold mb-1">Create an account</h1>
        <p className="text-sm text-slate-500 mb-6">
          Start measuring your site's carbon footprint.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              value={form.password}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="text-brand hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
