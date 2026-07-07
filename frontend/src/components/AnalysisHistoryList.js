import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAnalysisHistory } from "../services/analysisService";

function formatWhen(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function HistoryItemContent({ item }) {
  return (
    <>
      <p className="font-medium truncate">{shortUrl(item.url)}</p>
      <p className="text-[11px] text-slate-500 truncate">{item.url}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">
        {formatWhen(item.createdAt)}
        {item.carbonScore != null ? ` · Score ${item.carbonScore}` : ""}
        {item.hasSeo ? " · SEO" : ""}
        {item.isLegacy ? " · Limited" : ""}
      </p>
    </>
  );
}

export default function AnalysisHistoryList({
  activeAnalysisId,
  refreshKey = 0,
  variant = "sidebar",
}) {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isHorizontal = variant === "horizontal";

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError("");
      try {
        const data = await getAnalysisHistory();
        if (!cancelled) {
          setHistory(Array.isArray(data?.history) ? data.history : []);
        }
      } catch (err) {
        if (!cancelled) {
          const status = err?.response?.status;
          if (status === 404) {
            setError(
              "History API not found. Restart the backend server and refresh this page."
            );
          } else {
            setError(
              err?.response?.data?.error ||
                err?.message ||
                "Could not load history."
            );
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const heading = isHorizontal ? "Recent analysis" : "Recent analyses";
  const headingClass = isHorizontal
    ? "text-lg font-semibold text-slate-900"
    : "text-sm font-semibold text-slate-900 mb-2";

  return (
    <div
      className={
        isHorizontal
          ? "space-y-4"
          : "mt-5 pt-4 border-t border-slate-200"
      }
    >
      <h2 className={headingClass}>{heading}</h2>

      {loading && (
        <p className={`text-slate-500 ${isHorizontal ? "text-sm" : "text-xs"}`}>
          Loading history...
        </p>
      )}

      {!loading && error && (
        <p className={`text-red-600 ${isHorizontal ? "text-sm" : "text-xs"}`}>
          {error}
        </p>
      )}

      {!loading && !error && history.length === 0 && (
        <p className={`text-slate-500 ${isHorizontal ? "text-sm" : "text-xs"}`}>
          No saved analyses yet.
        </p>
      )}

      {!loading && !error && history.length > 0 && isHorizontal && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {history.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(`/analysis/${item.id}`)}
              className="min-w-[220px] max-w-[260px] shrink-0 text-left rounded-xl px-4 py-3 text-sm border border-slate-200 bg-white shadow-sm hover:border-brand/30 hover:bg-brand/5 transition-colors"
            >
              <HistoryItemContent item={item} />
            </button>
          ))}
        </div>
      )}

      {!loading && !error && history.length > 0 && !isHorizontal && (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {history.map((item) => {
            const isActive = String(item.id) === String(activeAnalysisId);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/analysis/${item.id}`)}
                  className={`w-full text-left rounded-md px-2 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-brand/10 text-brand-dark border border-brand/20"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <HistoryItemContent item={item} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
