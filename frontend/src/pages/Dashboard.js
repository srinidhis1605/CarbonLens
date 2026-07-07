import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import UrlInputForm from "../components/UrlInputForm";
import { runAnalysis } from "../services/analysisService";

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleAnalyze = async (url) => {
    setError("");
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

      navigate("/analysis", {
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
    </div>
  );
}
