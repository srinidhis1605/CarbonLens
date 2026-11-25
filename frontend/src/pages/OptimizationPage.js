import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  API_BASE_URL,
  getControlledSiteStatus,
  getOptimizationRuns,
  measureControlledSitesBrowser,
  runControlledOptimization,
} from "../services/v2Service";
import { getApiErrorMessage } from "../utils/apiError";

function formatKB(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
    return "Unavailable";
  }
  return `${(Number(bytes) / 1024).toFixed(2)} KB`;
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
    return "Unavailable";
  }
  return `${Number(bytes).toLocaleString()} B`;
}

function formatPct(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) {
    return "N/A";
  }
  return `${pct}%`;
}

export default function OptimizationPage() {
  const [siteStatus, setSiteStatus] = useState(null);
  const [browserMeasure, setBrowserMeasure] = useState(null);
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [runOriginLabel, setRunOriginLabel] = useState("");

  const [images, setImages] = useState(true);
  const [javascript, setJavascript] = useState(true);
  const [css, setCss] = useState(true);
  const [removeUnusedAssets, setRemoveUnusedAssets] = useState(true);
  const [imageQuality, setImageQuality] = useState(75);
  const [maxImageWidth, setMaxImageWidth] = useState(1200);

  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [measuringBrowser, setMeasuringBrowser] = useState(false);
  const [error, setError] = useState("");
  const [browserError, setBrowserError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadData = async (preserveActive = false) => {
    setLoading(true);
    if (!preserveActive) setError("");
    try {
      const [statusData, runsData] = await Promise.all([
        getControlledSiteStatus(),
        getOptimizationRuns(15),
      ]);
      setSiteStatus(statusData);
      setRuns(runsData);
      if (!preserveActive && runsData.length > 0) {
        setActiveRun(runsData[0]);
        setRunOriginLabel(`Saved Run #${runsData[0].id}`);
      }
    } catch (err) {
      setError(
        getApiErrorMessage(err, "Failed to load controlled website measurements.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRunOptimization = async () => {
    setError("");
    setSuccessMsg("");
    setBrowserMeasure(null);
    setActiveRun(null);
    setRunOriginLabel("Current Execution");
    setExecuting(true);
    try {
      const run = await runControlledOptimization({
        images,
        javascript,
        css,
        imageQuality,
        maxImageWidth,
        removeUnusedAssets,
      });
      setActiveRun(run);
      setRunOriginLabel("Current Execution");
      if (run?.status === "PARTIAL_SUCCESS") {
        setError(
          "Optimization finished with partial errors. Review failed operations below."
        );
      } else {
        setSuccessMsg(
          `Actual optimization completed (${formatPct(
            run.summary?.totalReductionPct
          )} live filesystem reduction). Original baseline preserved untouched.`
        );
      }
      await loadData(true);
    } catch (err) {
      const failedRun = err?.response?.data?.run || null;
      setActiveRun(failedRun);
      setRunOriginLabel("Current Execution (Failed)");
      setError(
        getApiErrorMessage(err, "Controlled website optimization failed.")
      );
      await loadData(true);
    } finally {
      setExecuting(false);
    }
  };

  const handleMeasureBrowser = async () => {
    setBrowserError("");
    setMeasuringBrowser(true);
    try {
      const data = await measureControlledSitesBrowser();
      setBrowserMeasure(data);
    } catch (err) {
      setBrowserError(
        getApiErrorMessage(err, "Playwright browser measurement failed.")
      );
    } finally {
      setMeasuringBrowser(false);
    }
  };

  const origTotals = siteStatus?.original?.totals || null;
  const optExists = Boolean(siteStatus?.optimized?.exists);
  const optTotals = optExists ? siteStatus?.optimized?.totals : null;
  const diskComparison = siteStatus?.comparison || null;

  const diskCategoryChartData =
    origTotals && optTotals && diskComparison?.byCategory
      ? [
          {
            category: "Images",
            OriginalKB: Number((diskComparison.byCategory.images.originalBytes / 1024).toFixed(2)),
            OptimizedKB: Number((diskComparison.byCategory.images.optimizedBytes / 1024).toFixed(2)),
            ReductionPct: diskComparison.byCategory.images.reductionPct,
          },
          {
            category: "JavaScript",
            OriginalKB: Number((diskComparison.byCategory.javascript.originalBytes / 1024).toFixed(2)),
            OptimizedKB: Number((diskComparison.byCategory.javascript.optimizedBytes / 1024).toFixed(2)),
            ReductionPct: diskComparison.byCategory.javascript.reductionPct,
          },
          {
            category: "CSS",
            OriginalKB: Number((diskComparison.byCategory.css.originalBytes / 1024).toFixed(2)),
            OptimizedKB: Number((diskComparison.byCategory.css.optimizedBytes / 1024).toFixed(2)),
            ReductionPct: diskComparison.byCategory.css.reductionPct,
          },
          {
            category: "HTML & Other",
            OriginalKB: Number((diskComparison.byCategory.htmlAndOther.originalBytes / 1024).toFixed(2)),
            OptimizedKB: Number((diskComparison.byCategory.htmlAndOther.optimizedBytes / 1024).toFixed(2)),
            ReductionPct: diskComparison.byCategory.htmlAndOther.reductionPct,
          },
        ]
      : [];

  const reductionPctChartData = diskCategoryChartData.filter(
    (d) => d.ReductionPct !== null && d.ReductionPct !== undefined
  );

  const selectedRunCats = activeRun?.summary?.byCategory
    ? [
        { key: "images", label: "Images" },
        { key: "javascript", label: "JavaScript" },
        { key: "css", label: "CSS" },
        ...(activeRun.summary.byCategory.htmlAndOther
          ? [{ key: "htmlAndOther", label: "HTML & Other" }]
          : []),
      ].map(({ key, label }) => {
        const c = activeRun.summary.byCategory[key];
        return {
          category: label,
          OriginalKB:
            c?.originalBytes != null ? Number((c.originalBytes / 1024).toFixed(2)) : null,
          OptimizedKB:
            c?.optimizedBytes != null ? Number((c.optimizedBytes / 1024).toFixed(2)) : null,
          reductionPct: c?.reductionPct ?? null,
        };
      })
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-dark font-semibold">
              CarbonLens 2.0 · Module 3
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">
              Actual Website Optimization Demonstration
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Executes real asset transformations (sharp WebP conversion &amp;
              resizing, Terser JS minification, CleanCSS minification, unused
              asset removal) on our owned controlled test website.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 self-start"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          <strong>ACTUAL FILE-LEVEL OPTIMIZATION:</strong> Modifies real files in{" "}
          <code>research/test-website/optimized/</code> while keeping{" "}
          <code>research/test-website/original/</code> strictly immutable. Disk
          sizes, browser transfer sizes, and calculated CO₂/energy estimates are
          reported in separate sections.
        </div>
      </header>

      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-md bg-emerald-50 text-emerald-800 text-sm border border-emerald-200">
          {successMsg}
        </div>
      )}

      {loading && !siteStatus ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
          Inspecting controlled website files on disk...
        </div>
      ) : !siteStatus ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">
          No measurement data available. Run the optimization pipeline to generate
          results.
        </div>
      ) : (
        <>
          {/* SECTION 1: FILESYSTEM MEASUREMENTS */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  1. Live Filesystem Measurements (On Disk)
                </h2>
                <p className="text-xs text-slate-500">
                  Source: <code>{siteStatus.measurementSource}</code> · Measured
                  at:{" "}
                  {siteStatus.measurementTimestamp
                    ? new Date(siteStatus.measurementTimestamp).toLocaleString()
                    : "Unavailable"}
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200">
                MEASURED · DISK
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded bg-slate-100 text-slate-700">
                    Original Baseline (MEASURED · DISK)
                  </span>
                  <a
                    href={`${API_BASE_URL}${siteStatus.originalServePath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-brand hover:underline"
                  >
                    Open Original Site ↗
                  </a>
                </div>
                <p className="text-2xl font-semibold text-slate-900">
                  {formatKB(origTotals?.totalBytes)}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ({formatBytes(origTotals?.totalBytes)} ·{" "}
                    {origTotals?.totalFiles ?? "—"} files)
                  </span>
                </p>
                <div className="text-xs text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div>
                    <strong>Images ({origTotals?.imageCount ?? "—"}):</strong>{" "}
                    {formatKB(origTotals?.imageBytes)}
                  </div>
                  <div>
                    <strong>JS ({origTotals?.javascriptCount ?? "—"}):</strong>{" "}
                    {formatKB(origTotals?.javascriptBytes)}
                  </div>
                  <div>
                    <strong>CSS ({origTotals?.cssCount ?? "—"}):</strong>{" "}
                    {formatKB(origTotals?.cssBytes)}
                  </div>
                  <div>
                    <strong>HTML/Other ({origTotals?.htmlAndOtherCount ?? "—"}):</strong>{" "}
                    {formatKB(origTotals?.htmlAndOtherBytes)}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Optimized Output (MEASURED · DISK)
                  </span>
                  {optExists && (
                    <a
                      href={`${API_BASE_URL}${siteStatus.optimizedServePath}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Open Optimized Site ↗
                    </a>
                  )}
                </div>
                {optExists && optTotals ? (
                  <>
                    <p className="text-2xl font-semibold text-emerald-700">
                      {formatKB(optTotals.totalBytes)}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        ({formatBytes(optTotals.totalBytes)} ·{" "}
                        {optTotals.totalFiles} files · -
                        {formatPct(diskComparison?.total?.reductionPct)})
                      </span>
                    </p>
                    <div className="text-xs text-slate-600 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div>
                        <strong>Images ({optTotals.imageCount}):</strong>{" "}
                        {formatKB(optTotals.imageBytes)}
                      </div>
                      <div>
                        <strong>JS ({optTotals.javascriptCount}):</strong>{" "}
                        {formatKB(optTotals.javascriptBytes)}
                      </div>
                      <div>
                        <strong>CSS ({optTotals.cssCount}):</strong>{" "}
                        {formatKB(optTotals.cssBytes)}
                      </div>
                      <div>
                        <strong>HTML/Other ({optTotals.htmlAndOtherCount}):</strong>{" "}
                        {formatKB(optTotals.htmlAndOtherBytes)}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    No measurement data available. Run the optimization pipeline
                    to generate results.
                  </p>
                )}
              </div>
            </div>

            {optExists && diskCategoryChartData.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Measured Asset Size Comparison on Disk (KB)
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-500">
                      Reconciled:{" "}
                      {diskComparison?.reconciliationVerified ? "YES" : "NO"}
                    </span>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={diskCategoryChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} unit=" KB" />
                        <Tooltip />
                        <Legend />
                        <Bar
                          dataKey="OriginalKB"
                          name="Original on Disk (KB)"
                          fill="#64748b"
                        />
                        <Bar
                          dataKey="OptimizedKB"
                          name="Optimized on Disk (KB)"
                          fill="#16a34a"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {reductionPctChartData.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">
                      Disk Category Size Reduction (%) — Measured
                    </h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reductionPctChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                          <Tooltip formatter={(v) => [`${v}%`, "Reduction"]} />
                          <Legend />
                          <Bar
                            dataKey="ReductionPct"
                            name="Measured Disk Reduction %"
                            fill="#2563eb"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500">
                No measurement data available. Run the optimization pipeline to
                generate results.
              </div>
            )}
          </section>

          {/* SECTION 2: EXECUTE OPTIMIZATION PIPELINE */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              2. Execute Real Asset Optimization Pipeline
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={images}
                  onChange={(e) => setImages(e.target.checked)}
                  className="accent-brand"
                />
                <span>Images (sharp → WebP)</span>
              </label>
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={javascript}
                  onChange={(e) => setJavascript(e.target.checked)}
                  className="accent-brand"
                />
                <span>JavaScript (Terser)</span>
              </label>
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={css}
                  onChange={(e) => setCss(e.target.checked)}
                  className="accent-brand"
                />
                <span>CSS (CleanCSS)</span>
              </label>
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeUnusedAssets}
                  onChange={(e) => setRemoveUnusedAssets(e.target.checked)}
                  className="accent-brand"
                />
                <span>Remove Unused Assets</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  WebP Quality: <strong>{imageQuality}</strong>
                </label>
                <input
                  type="range"
                  min={40}
                  max={95}
                  value={imageQuality}
                  onChange={(e) => setImageQuality(Number(e.target.value))}
                  className="w-full accent-brand"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Max Hero Image Width: <strong>{maxImageWidth}px</strong>
                </label>
                <input
                  type="range"
                  min={400}
                  max={2000}
                  step={50}
                  value={maxImageWidth}
                  onChange={(e) => setMaxImageWidth(Number(e.target.value))}
                  className="w-full accent-brand"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={executing}
                onClick={handleRunOptimization}
                className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-60"
              >
                {executing ? "Optimizing Assets..." : "Run Actual Optimization"}
              </button>
              <button
                type="button"
                disabled={measuringBrowser}
                onClick={handleMeasureBrowser}
                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
              >
                {measuringBrowser
                  ? "Measuring in Chromium..."
                  : "Measure Both Sites in Playwright Browser"}
              </button>
            </div>
          </section>

          {/* SECTION 3: BROWSER TRANSFER MEASUREMENTS VS CALCULATED ESTIMATES */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  3. Live Browser Transfer Measurements (Playwright) &amp;
                  Calculated Estimates
                </h2>
                <p className="text-xs text-slate-500">
                  Separates actual HTTP bytes transferred in headless Chromium
                  (MEASURED) from CarbonLens formula estimates (CALCULATED).
                </p>
              </div>
              <div className="flex gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  MEASURED · BROWSER
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  CALCULATED
                </span>
              </div>
            </div>

            {browserError && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                {browserError}
              </div>
            )}

            {!browserMeasure ? (
              <p className="text-sm text-slate-500">
                No browser measurement data available yet. Click "Measure Both
                Sites in Playwright Browser" above to run live Chromium
                measurements.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Browser:{" "}
                  <code>
                    {browserMeasure.original?.browserConfig?.browser}{" "}
                    {browserMeasure.original?.browserConfig?.browserVersion}
                  </code>{" "}
                  · Viewport:{" "}
                  {browserMeasure.original?.browserConfig?.viewport?.width}x
                  {browserMeasure.original?.browserConfig?.viewport?.height} ·
                  Measured at:{" "}
                  {new Date(browserMeasure.measurementTimestamp).toLocaleString()}
                </p>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-2 pr-4">Metric</th>
                        <th className="py-2 pr-4">Category</th>
                        <th className="py-2 pr-4">Original Site</th>
                        <th className="py-2 pr-4">Optimized Site</th>
                        <th className="py-2">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">Transferred Bytes</td>
                        <td className="py-2 pr-4">MEASURED · BROWSER</td>
                        <td className="py-2 pr-4">
                          {formatBytes(browserMeasure.original?.measuredBrowser?.totalBytes)}
                        </td>
                        <td className="py-2 pr-4">
                          {browserMeasure.optimized
                            ? formatBytes(browserMeasure.optimized.measuredBrowser.totalBytes)
                            : "Unavailable"}
                        </td>
                        <td className="py-2 font-semibold text-emerald-700">
                          {browserMeasure.comparison
                            ? `-${formatPct(browserMeasure.comparison.transferredReductionPct)}`
                            : "—"}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">HTTP Requests</td>
                        <td className="py-2 pr-4">MEASURED · BROWSER</td>
                        <td className="py-2 pr-4">
                          {browserMeasure.original?.measuredBrowser?.totalRequests ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {browserMeasure.optimized?.measuredBrowser?.totalRequests ?? "Unavailable"}
                        </td>
                        <td className="py-2">
                          {browserMeasure.comparison
                            ? `-${browserMeasure.comparison.requestsSaved} reqs`
                            : "—"}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">
                          Image / JS / CSS Transfer
                        </td>
                        <td className="py-2 pr-4">MEASURED · BROWSER</td>
                        <td className="py-2 pr-4">
                          {formatKB(browserMeasure.original?.measuredBrowser?.imageBytes)} /{" "}
                          {formatKB(browserMeasure.original?.measuredBrowser?.scriptBytes)} /{" "}
                          {formatKB(browserMeasure.original?.measuredBrowser?.styleBytes)}
                        </td>
                        <td className="py-2 pr-4">
                          {browserMeasure.optimized
                            ? `${formatKB(browserMeasure.optimized.measuredBrowser.imageBytes)} / ${formatKB(browserMeasure.optimized.measuredBrowser.scriptBytes)} / ${formatKB(browserMeasure.optimized.measuredBrowser.styleBytes)}`
                            : "Unavailable"}
                        </td>
                        <td className="py-2">—</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">
                          TTFB / DOMContentLoaded / Load
                        </td>
                        <td className="py-2 pr-4">MEASURED · BROWSER</td>
                        <td className="py-2 pr-4">
                          {browserMeasure.original?.measuredBrowser?.timeToFirstByteMs}ms /{" "}
                          {browserMeasure.original?.measuredBrowser?.domContentLoadedMs}ms /{" "}
                          {browserMeasure.original?.measuredBrowser?.pageLoadTimeMs}ms
                        </td>
                        <td className="py-2 pr-4">
                          {browserMeasure.optimized
                            ? `${browserMeasure.optimized.measuredBrowser.timeToFirstByteMs}ms / ${browserMeasure.optimized.measuredBrowser.domContentLoadedMs}ms / ${browserMeasure.optimized.measuredBrowser.pageLoadTimeMs}ms`
                            : "Unavailable"}
                        </td>
                        <td className="py-2">—</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium">
                          Calculated Energy (kWh)
                        </td>
                        <td className="py-2 pr-4">CALCULATED</td>
                        <td className="py-2 pr-4">
                          {browserMeasure.original?.calculatedEstimates?.energyUsedKWh ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {browserMeasure.optimized?.calculatedEstimates?.energyUsedKWh ?? "Unavailable"}
                        </td>
                        <td className="py-2">
                          {browserMeasure.comparison
                            ? `-${browserMeasure.comparison.energySavedKWh} kWh`
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 font-medium">
                          Calculated CO₂ (g) &amp; Score
                        </td>
                        <td className="py-2 pr-4">CALCULATED</td>
                        <td className="py-2 pr-4">
                          {browserMeasure.original?.calculatedEstimates?.co2EstimateGrams}g ·{" "}
                          {browserMeasure.original?.calculatedEstimates?.carbonScore}/100
                        </td>
                        <td className="py-2 pr-4">
                          {browserMeasure.optimized
                            ? `${browserMeasure.optimized.calculatedEstimates.co2EstimateGrams}g · ${browserMeasure.optimized.calculatedEstimates.carbonScore}/100`
                            : "Unavailable"}
                        </td>
                        <td className="py-2 font-semibold text-emerald-700">
                          {browserMeasure.comparison
                            ? `-${browserMeasure.comparison.co2SavedGrams}g (+${browserMeasure.comparison.scoreDelta} pts)`
                            : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {activeRun && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Optimization Execution Log{" "}
                {activeRun.id ? `(#${activeRun.id})` : ""}{" "}
                {runOriginLabel && (
                  <span className="text-xs font-normal text-slate-500">
                    — {runOriginLabel}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                Status:{" "}
                <strong
                  className={
                    activeRun.status === "COMPLETED"
                      ? "text-emerald-700"
                      : "text-red-700"
                  }
                >
                  {activeRun.status}
                </strong>{" "}
                · Original Preserved:{" "}
                <strong>
                  {activeRun.summary?.originalPreserved ? "YES" : "NO"}
                </strong>{" "}
                · Recorded Reduction:{" "}
                <strong>{formatPct(activeRun.summary?.totalReductionPct)}</strong>
                {activeRun.startedAt && (
                  <> · Recorded At: {new Date(activeRun.startedAt).toLocaleString()}</>
                )}
              </p>
            </div>
          </div>

          {selectedRunCats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {selectedRunCats.map((c) => (
                <div
                  key={c.category}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <p className="font-semibold text-slate-700">{c.category}</p>
                  <p className="text-slate-900 mt-1">
                    {c.OriginalKB != null ? `${c.OriginalKB} KB` : "—"} →{" "}
                    {c.OptimizedKB != null ? `${c.OptimizedKB} KB` : "—"}
                  </p>
                  <p className="text-emerald-700 font-medium">
                    Reduction: {formatPct(c.reductionPct)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {Array.isArray(activeRun.errors) && activeRun.errors.length > 0 && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700">
              Errors: {JSON.stringify(activeRun.errors)}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Original File</th>
                  <th className="py-2 pr-3">Optimized File</th>
                  <th className="py-2 pr-3">Operation</th>
                  <th className="py-2 pr-3">Orig KB</th>
                  <th className="py-2 pr-3">Opt KB</th>
                  <th className="py-2">Reduction</th>
                </tr>
              </thead>
              <tbody>
                {(activeRun.operations || []).map((op, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium">{op.category}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold ${
                          op.status === "SUCCESS"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {op.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono">{op.originalFile}</td>
                    <td className="py-2 pr-3 font-mono">
                      {op.optimizedFile || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {op.operation}
                      {op.originalDimensions && op.optimizedDimensions && (
                        <span className="block text-[11px] text-slate-500">
                          Dimensions: {op.originalDimensions} →{" "}
                          {op.optimizedDimensions}
                        </span>
                      )}
                      {op.error && (
                        <span className="block text-[11px] text-red-600">
                          Error: {op.error}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{formatKB(op.originalBytes)}</td>
                    <td className="py-2 pr-3">{formatKB(op.optimizedBytes)}</td>
                    <td className="py-2 font-semibold text-emerald-700">
                      {formatPct(op.reductionPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Saved Optimization Runs ({runs.length})
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500">
            No saved optimization runs recorded in database yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-4">Run ID</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Original</th>
                  <th className="py-2 pr-4">Optimized</th>
                  <th className="py-2 pr-4">Reduction</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">#{run.id}</td>
                    <td className="py-2 pr-4 text-xs">{run.status}</td>
                    <td className="py-2 pr-4">
                      {formatKB(run.summary?.originalTotalBytes)}
                    </td>
                    <td className="py-2 pr-4">
                      {formatKB(run.summary?.optimizedTotalBytes)}
                    </td>
                    <td className="py-2 pr-4">
                      {formatPct(run.summary?.totalReductionPct)}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveRun(run);
                          setRunOriginLabel(`Saved Run #${run.id}`);
                        }}
                        className="text-brand font-medium hover:underline"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
