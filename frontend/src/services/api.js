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

const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const message = error.response?.data?.error;

    const shouldRefresh =
      !originalRequest?._retry &&
      (status === 401 || status === 403) &&
      (message === "Invalid token" || message === "Access denied, no token found");

    if (!shouldRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const { data } = await refreshClient.post("/auth/refresh");
      const newToken = data?.accessToken;
      if (!newToken) {
        throw new Error("Refresh response missing accessToken");
      }

      localStorage.setItem("accessToken", newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
      return Promise.reject(refreshError);
    }
  }
);

export default api;
