import React, { useState } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import AnalysisSummary from "../components/AnalysisSummary";
import SeoReport from "../components/SeoReport";
import { runSeoAudit } from "../services/analysisService";

export default function AnalysisResult() {
  const location = useLocation();
  const { analysis, analysisId, url } = location.state || {};

  const [seo, setSeo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const performanceNavItems = [
    { id: "environmental-metrics", label: "Environmental metrics" },
    { id: "speed-metrics", label: "Speed metrics" },
    { id: "network-traffic", label: "Network traffic" },
    {
      id: "ai-sustainability-suggestions",
      label: "AI sustainability suggestions",
      conditional: true,
    },
  ];

  const seoNavItems = [
    { id: "seo-overview", label: "SEO overview" },
    { id: "seo-meta", label: "Meta" },
    { id: "seo-content-structure", label: "Content structure" },
    { id: "seo-crawl-legal", label: "Audit checklist" },
    { id: "seo-open-graph", label: "Open Graph" },
    { id: "seo-social-links", label: "Social links" },
    { id: "seo-keywords", label: "Keywords", conditional: true },
    { id: "seo-ai-suggestions", label: "AI structural suggestions", conditional: true },
  ];

  if (!analysis || !analysisId) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSeoAudit = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await runSeoAudit(analysisId, url);
      setSeo(data);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "SEO audit failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const suggestions = Array.isArray(analysis?.AI_SUSTAINABILITY_OPTIMIZATIONS)
    ? analysis.AI_SUSTAINABILITY_OPTIMIZATIONS
    : [];
  const visiblePerformanceNavItems = performanceNavItems.filter(
    (item) => !item.conditional || suggestions.length > 0
  );

  const seoReport = seo?.SEO_METRICS_REPORT || {};
  const seoKeywords = Array.isArray(seoReport.keywords) ? seoReport.keywords : [];
  const seoSuggestions = Array.isArray(seo?.AI_STRUCTURAL_OPTIMIZATIONS)
    ? seo.AI_STRUCTURAL_OPTIMIZATIONS
    : [];
  const visibleSeoNavItems = seo
    ? seoNavItems.filter((item) => {
        if (!item.conditional) return true;
        if (item.id === "seo-keywords") return seoKeywords.length > 0;
        if (item.id === "seo-ai-suggestions") return seoSuggestions.length > 0;
        return true;
      })
    : [];

  const scrollToSection = (sectionId) => {
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <header className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              CarbonLens Intelligence Report
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Website Sustainability & SEO Audit
            </h1>
            <p className="text-sm text-slate-500 break-all">{url}</p>
            <p className="text-xs text-slate-400">
              Record ID: {String(analysisId)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSeoAudit}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Running..." : seo ? "Re-run SEO audit" : "Run SEO audit"}
            </button>
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              New analysis
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="hidden md:block lg:col-span-3">
          <div className="sticky top-6 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Sections</h2>
            <nav className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Performance
              </p>
              {visiblePerformanceNavItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="block w-full text-left text-sm text-slate-600 hover:text-slate-900 hover:underline"
                >
                  {item.label}
                </button>
              ))}

              {visibleSeoNavItems.length > 0 && (
                <>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 pt-3">
                    SEO audit
                  </p>
                  {visibleSeoNavItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollToSection(item.id)}
                      className="block w-full text-left text-sm text-slate-600 hover:text-slate-900 hover:underline"
                    >
                      {item.label}
                    </button>
                  ))}
                </>
              )}
            </nav>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-8">
          <section id="performance-summary" className="scroll-mt-24">
            <AnalysisSummary analysis={analysis} />
          </section>

          <section id="seo-audit" className="scroll-mt-24">
            {seo ? (
              <SeoReport seo={seo} />
            ) : (
              !loading && (
                <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-500">
                  Click "Run SEO audit" to fetch the SEO report for this analysis.
                </div>
              )
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
