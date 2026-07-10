import React from "react";
import AssetBreakdownChart from "./charts/AssetBreakdownChart";
import PerformanceScoreDonut from "./charts/PerformanceScoreDonut";
import PerformanceWaterfallChart from "./charts/PerformanceWaterfallChart";

function Stat({ label, value }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 break-words">
        {value ?? "—"}
      </p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200">
      <h3 className="font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function formatSessionStatus(status) {
  const labels = {
    PERFORMANCE_ANALYSIS_COMPLETED: "Performance analysis successful",
    SEO_AUDIT_COMPLETED: "SEO audit successful",
    CRITICAL_VECTOR_FAILURE: "Analysis failed",
    SEO_AUDIT_FAILURE: "SEO audit failed",
  };

  if (!status) return "—";
  if (labels[status]) return labels[status];

  return String(status)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

export default function AnalysisSummary({ analysis, aiLoading = false }) {
  if (!analysis) return null;

  const host = analysis.TARGET_HOST;
  const status = formatSessionStatus(analysis.SESSION_STATUS);
  const recordId = analysis.DATABASE_RECORD_ID;

  const phase1 = analysis.PHASE_1_RAW_SOCKET_INTERCEPTION || {};
  const traffic = phase1.INTERCEPTED_TRAFFIC || {};
  const payloads = Array.isArray(phase1.EXTRACTED_PAYLOAD_SIGNATURES)
    ? phase1.EXTRACTED_PAYLOAD_SIGNATURES
    : [];

  const phase2 = analysis.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION || {};
  const hosting = phase2.HOSTING_INFRASTRUCTURE || {};
  const reconstructed = phase2.RECONSTRUCTED_METRICS || {};

  const phase3 = analysis.PHASE_3_SPEED_METRICS_TRANSCRIPT || {};
  const metrics = phase3.METRICS || {};

  const suggestions = Array.isArray(analysis.AI_SUSTAINABILITY_OPTIMIZATIONS)
    ? analysis.AI_SUSTAINABILITY_OPTIMIZATIONS
    : [];

  const impactColor = (impact) => {
    switch ((impact || "").toUpperCase()) {
      case "HIGH":
        return "bg-red-100 text-red-700";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800";
      case "LOW":
        return "bg-green-100 text-green-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <section className="space-y-5">
      <div id="analysis-overview" className="scroll-mt-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Target host" value={host} />
          <Stat label="Status" value={status} />
          <Stat label="Record ID" value={recordId} />
          <Stat
            label="Total transferred"
            value={phase2.TOTAL_TRANSMITTED_WEIGHT}
          />
        </div>
      </div>

      <div id="environmental-metrics" className="scroll-mt-24">
        <Card title="Environmental">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Carbon efficiency</span>
                <span className="font-medium">
                  {reconstructed.CARBON_EFFICIENCY_SCORE ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sustainability grade</span>
                <span className="font-medium">
                  {reconstructed.SUSTAINABILITY_GRADE ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Green hosting</span>
                <span className="font-medium">
                  {typeof hosting.IS_GREEN_PROVIDER === "boolean"
                    ? hosting.IS_GREEN_PROVIDER
                      ? "Yes"
                      : "No"
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Source</span>
                <span className="font-medium text-right">
                  {hosting.PROVIDER_SOURCE_CREDIT ?? "—"}
                </span>
              </div>
            </div>
            <PerformanceScoreDonut
              scoreText={reconstructed.CARBON_EFFICIENCY_SCORE}
              grade={reconstructed.SUSTAINABILITY_GRADE}
            />
          </div>
        </Card>
      </div>

      <div id="speed-metrics" className="scroll-mt-24">
        <Card title="Speed metrics">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">TTFB</span>
              <span className="font-medium">
                {metrics.SERVER_RESPONSE_LAG_TTFB ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">DOM ready</span>
              <span className="font-medium">
                {metrics.DOM_STRUCTURAL_READINESS ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Visual render</span>
              <span className="font-medium">
                {metrics.TOTAL_VISUAL_RENDER_TIME ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">4G download</span>
              <span className="font-medium">
                {metrics.ESTIMATED_4G_DOWNLOAD_DELAY ?? "—"}
              </span>
            </div>
          </div>
          <PerformanceWaterfallChart metrics={metrics} />
        </Card>
      </div>

      <div id="network-traffic" className="scroll-mt-24">
        <Card title="Network traffic">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Total requests</span>
              <span className="font-medium">
                {traffic.TOTAL_NETWORK_REQUESTS_LOGGED ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Third-party</span>
              <span className="font-medium">
                {traffic.FOREIGN_THIRD_PARTY_INJECTIONS ?? "—"}
              </span>
            </div>
          </div>

          {payloads.length > 0 && (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-500 text-left">
                    <tr>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Count</th>
                      <th className="py-2">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payloads.map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2 pr-4">{p.CLASSIFICATION ?? "—"}</td>
                        <td className="py-2 pr-4">{p.COUNT ?? "—"}</td>
                        <td className="py-2">{p.RAW_WEIGHT ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AssetBreakdownChart payloads={payloads} />
            </>
          )}
        </Card>
      </div>

      {(suggestions.length > 0 || aiLoading) && (
        <div id="ai-sustainability-suggestions" className="scroll-mt-24">
          <Card title="AI sustainability suggestions">
            {aiLoading ? (
              <p className="text-sm text-slate-500">Generating recommendations...</p>
            ) : (
              <ul className="space-y-3">
                {suggestions.map((s, i) => (
                  <li key={i} className="border border-slate-100 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${impactColor(
                          s.impact
                        )}`}
                      >
                        {s.impact ?? "—"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {s.category ?? ""}
                      </span>
                    </div>
                    <p className="font-medium">{s.title ?? "—"}</p>
                    <p className="text-sm text-slate-600 mt-1">
                      {s.description ?? ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
