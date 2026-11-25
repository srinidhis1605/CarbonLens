import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getAnalysisHistory } from "../services/analysisService";
import {
  analyzeWithAgent,
  getAgentReports,
} from "../services/v2Service";
import { getApiErrorMessage } from "../utils/apiError";

function badgeClass(value) {
  switch (String(value || "").toUpperCase()) {
    case "HIGH":
      return "bg-red-100 text-red-700 border-red-200";
    case "MEDIUM":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "LOW":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function formatKb(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
    return "Unavailable";
  }
  return `${(Number(bytes) / 1024).toFixed(1)} KB`;
}

const CHART_COLORS = ["#16a34a", "#2563eb", "#d97706", "#7c3aed", "#64748b"];

export default function AiAgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAnalysisId = searchParams.get("analysisId") || "";

  const [history, setHistory] = useState([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(initialAnalysisId);
  const [savedReports, setSavedReports] = useState([]);
  const [activeReport, setActiveReport] = useState(null);
  const [cachedFlag, setCachedFlag] = useState(false);

  const [loadingInit, setLoadingInit] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      setLoadingInit(true);
      setError("");
      try {
        const [histRes, reportsRes] = await Promise.all([
          getAnalysisHistory(30),
          getAgentReports(20),
        ]);
        if (cancelled) return;

        const items = Array.isArray(histRes?.history) ? histRes.history : [];
        setHistory(items);
        setSavedReports(reportsRes);

        const targetId =
          initialAnalysisId || (items.length > 0 ? String(items[0].id) : "");
        if (targetId) {
          setSelectedAnalysisId(targetId);
          const matching = reportsRes.find(
            (r) => String(r.analysisId) === String(targetId)
          );
          if (matching) {
            setActiveReport(matching);
            setCachedFlag(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(err, "Failed to load scan history or agent reports.")
          );
        }
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [initialAnalysisId]);

  const handleRunAgent = async (forceRefresh = false) => {
    if (!selectedAnalysisId) {
      setError("Please select a saved website scan first.");
      return;
    }
    setError("");
    setAnalyzing(true);
    try {
      const res = await analyzeWithAgent({
        analysisId: Number(selectedAnalysisId),
        forceRefresh,
      });
      setActiveReport(res.report);
      setCachedFlag(Boolean(res.cached));
      setSearchParams({ analysisId: selectedAnalysisId });
      const updatedReports = await getAgentReports(20);
      setSavedReports(updatedReports);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "AI Sustainability Agent failed to analyze scan.")
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const evidence = activeReport?.scanEvidence || null;
  const recommendations = Array.isArray(activeReport?.recommendations)
    ? activeReport.recommendations
    : [];
  const isFallback = activeReport?.generationMode === "deterministic_fallback";

  const resourceChartData =
    evidence && typeof evidence.totalBytes === "number"
      ? [
          { name: "Images", sizeKB: Number(((evidence.imageBytes ?? 0) / 1024).toFixed(2)) },
          { name: "JavaScript", sizeKB: Number(((evidence.scriptBytes ?? 0) / 1024).toFixed(2)) },
          { name: "CSS", sizeKB: Number(((evidence.styleBytes ?? 0) / 1024).toFixed(2)) },
          { name: "Fonts", sizeKB: Number(((evidence.fontBytes ?? 0) / 1024).toFixed(2)) },
          { name: "Other", sizeKB: Number(((evidence.otherBytes ?? 0) / 1024).toFixed(2)) },
        ]
      : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-dark font-semibold">
              CarbonLens 2.0 · Module 1
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">
              AI Sustainability Agent
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Analyzes actual saved website scan telemetry to identify measurable
              inefficiencies, prioritize fixes, and explain engineering impact.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 self-start"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <strong>Advisory Notice:</strong> The AI Sustainability Agent only
          analyzes scan measurements and never modifies any live website. Energy
          and CO₂ values are calculated estimates (0.06 kWh/GB model), not direct
          physical measurements.
        </div>
      </header>

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-slate-900">
          1. Select Real Website Scan Baseline
        </h2>

        {loadingInit ? (
          <p className="text-sm text-slate-500">Loading saved scans...</p>
        ) : history.length === 0 ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            No saved website scans found yet.{" "}
            <Link to="/dashboard" className="font-semibold underline">
              Run a website scan on the Dashboard first
            </Link>{" "}
            so the AI Sustainability Agent can analyze real measurements.
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Saved Scan Record
              </label>
              <select
                value={selectedAnalysisId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedAnalysisId(nextId);
                  setError("");
                  const matching = savedReports.find(
                    (r) => String(r.analysisId) === String(nextId) && r.generationMode === "gemini"
                  );
                  if (matching) {
                    setActiveReport(matching);
                    setCachedFlag(true);
                  } else {
                    setActiveReport(null);
                    setCachedFlag(false);
                  }
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.id} — {item.url} (Score: {item.carbonScore}/100)
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={analyzing || !selectedAnalysisId}
              onClick={() => handleRunAgent(false)}
              className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-60"
            >
              {analyzing ? "Analyzing..." : "Analyze Scan"}
            </button>
            <button
              type="button"
              disabled={analyzing || !selectedAnalysisId}
              onClick={() => handleRunAgent(true)}
              className="px-4 py-2 rounded-md border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              Re-run Fresh Analysis
            </button>
          </div>
        )}
      </section>

      {activeReport && (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Overall Sustainability Assessment
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 break-all">
                  Target: {activeReport.targetUrl} · Analysis #{activeReport.analysisId}
                  {cachedFlag ? " · Loaded from saved database report" : ""}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  isFallback
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {isFallback
                  ? "RULE-BASED · Deterministic Fallback Engine"
                  : `AI-GENERATED · ${activeReport.modelName || "gemini-2.5-flash"}`}
              </span>
            </div>

            {isFallback && activeReport.fallbackReason && (
              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <strong>Provider Note:</strong> {activeReport.fallbackReason}
              </div>
            )}

            <p className="text-sm text-slate-700 leading-relaxed">
              {activeReport.overallAssessment}
            </p>

            {evidence && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase">Page Weight (MEASURED)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {evidence.pageWeightMB != null ? `${Number(evidence.pageWeightMB).toFixed(2)} MB` : "Unavailable"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {evidence.totalBytes != null ? `${Number(evidence.totalBytes).toLocaleString()} B` : "—"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase">Images (MEASURED)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {formatKb(evidence.imageBytes)}
                    {evidence.imageSharePct != null ? ` (${evidence.imageSharePct}%)` : ""}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase">JavaScript (MEASURED)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {formatKb(evidence.scriptBytes)}
                    {evidence.scriptSharePct != null ? ` (${evidence.scriptSharePct}%)` : ""}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase">CSS (MEASURED)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {formatKb(evidence.styleBytes)}
                    {evidence.styleSharePct != null ? ` (${evidence.styleSharePct}%)` : ""}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase">Requests (MEASURED)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {evidence.totalRequests ?? "Unavailable"} ({evidence.thirdPartyRequests ?? "—"} 3P)
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] text-slate-500 uppercase">Score / CO₂ (CALCULATED)</p>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">
                    {evidence.carbonScore ?? "—"}/100 ·{" "}
                    {evidence.co2EstimateGrams != null ? `${Number(evidence.co2EstimateGrams).toFixed(4)} g` : "Unavailable"}
                  </p>
                </div>
              </div>
            )}

            {resourceChartData.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  MEASURED Resource Breakdown from Saved Scan #{activeReport.analysisId} (KB)
                </p>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resourceChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} unit=" KB" />
                      <Tooltip formatter={(v) => [`${v} KB`, "Measured Size"]} />
                      <Bar dataKey="sizeKB" radius={[4, 4, 0, 0]}>
                        {resourceChartData.map((entry, idx) => (
                          <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Prioritized Recommendations ({recommendations.length})
            </h2>
            <div className="space-y-4">
              {recommendations.map((rec, idx) => (
                <article
                  key={idx}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded border ${badgeClass(
                          rec.priority
                        )}`}
                      >
                        PRIORITY: {rec.priority}
                      </span>
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {rec.resourceCategory}
                      </span>
                      <span className="text-xs text-slate-500">
                        Difficulty: <strong>{rec.estimatedImplementationDifficulty}</strong>
                      </span>
                    </div>
                  </div>

                  <h3 className="text-base font-semibold text-slate-900">
                    {rec.issueIdentified}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                        Measured Facts (From Scan)
                      </p>
                      <p className="text-slate-800">
                        {rec.measuredFacts || rec.evidenceFromScan}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                        Engineering Inference
                      </p>
                      <p className="text-slate-800">
                        {rec.engineeringInference || rec.whyItMatters}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200">
                      <p className="text-xs font-semibold uppercase text-emerald-800 mb-1">
                        General Suggestion
                      </p>
                      <p className="text-slate-800">
                        {rec.generalSuggestion || rec.recommendedSolution}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-200">
                      <p className="text-xs font-semibold uppercase text-blue-800 mb-1">
                        Expected Direction of Improvement
                      </p>
                      <p className="text-slate-800">{rec.expectedImprovement}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {savedReports.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Saved AI Agent Reports ({savedReports.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-4">Report</th>
                  <th className="py-2 pr-4">Target URL</th>
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4">Items</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {savedReports.map((rep) => (
                  <tr key={rep.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">#{rep.id}</td>
                    <td className="py-2 pr-4 max-w-xs truncate">{rep.targetUrl}</td>
                    <td className="py-2 pr-4 text-xs">{rep.generationMode}</td>
                    <td className="py-2 pr-4">
                      {Array.isArray(rep.recommendations) ? rep.recommendations.length : 0}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveReport(rep);
                          setCachedFlag(true);
                          if (rep.analysisId) {
                            setSelectedAnalysisId(String(rep.analysisId));
                          }
                        }}
                        className="text-brand font-medium hover:underline"
                      >
                        Load
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
