import axios from "axios";

const baseURL =
  process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE_URL;

if (!baseURL) {
  throw new Error(
    "Missing REACT_APP_API_URL (or REACT_APP_API_BASE_URL). Set it in frontend/.env"
  );
}

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Attach token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
