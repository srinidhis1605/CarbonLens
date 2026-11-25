import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import UrlInputForm from "../components/UrlInputForm";
import AnalysisHistoryList from "../components/AnalysisHistoryList";
import AnalysisLoadingOverlay from "../components/AnalysisLoadingOverlay";
import { runAnalysis } from "../services/analysisService";

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleAnalyze = async (url) => {
    setError("");
    setLoadingUrl(url);
    setLoading(true);
    try {
      const data = await runAnalysis(url);
      const recordId =
        data?.DATABASE_RECORD_ID ??
        data?.data?.DATABASE_RECORD_ID ??
        data?.result?.DATABASE_RECORD_ID;

      if (!recordId) {
        throw new Error("Analysis response missing DATABASE_RECORD_ID.");
      }

      navigate(`/analysis/${recordId}`, {
        state: { analysis: data, analysisId: recordId, url },
      });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Analysis failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <AnalysisLoadingOverlay active={loading} mode="performance" url={loadingUrl} />

      <div>
        <h1 className="text-3xl font-semibold">Analyze a website</h1>
        <p className="text-slate-600 mt-1">
          Enter a URL to measure its carbon footprint and run an SEO audit.
        </p>
      </div>

      <UrlInputForm onSubmit={handleAnalyze} loading={loading} />

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      <AnalysisHistoryList variant="horizontal" />

      <section className="pt-2 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          CarbonLens 2.0 Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/agent"
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand/40 hover:bg-brand/5 transition-colors"
          >
            <p className="text-xs font-semibold uppercase text-brand-dark">
              Module 1
            </p>
            <h3 className="font-semibold text-slate-900 mt-1">
              AI Sustainability Agent
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Evidence-based issue analysis and prioritized engineering actions.
            </p>
          </Link>
          <Link
            to="/simulator"
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand/40 hover:bg-brand/5 transition-colors"
          >
            <p className="text-xs font-semibold uppercase text-brand-dark">
              Module 2
            </p>
            <h3 className="font-semibold text-slate-900 mt-1">
              What-if Simulator
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Simulate image, JS, CSS, and request reductions on real scans.
            </p>
          </Link>
          <Link
            to="/optimization"
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-brand/40 hover:bg-brand/5 transition-colors"
          >
            <p className="text-xs font-semibold uppercase text-brand-dark">
              Module 3
            </p>
            <h3 className="font-semibold text-slate-900 mt-1">
              Website Optimization
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Run real sharp/Terser/CleanCSS optimization on the controlled site.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
