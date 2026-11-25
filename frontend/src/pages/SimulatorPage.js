import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { getAnalysisById, getAnalysisHistory } from "../services/analysisService";
import {
  getSavedSimulations,
  getSimulationScenarios,
  previewSimulation,
  saveSimulation,
} from "../services/v2Service";
import { getApiErrorMessage } from "../utils/apiError";

function buildInitialConfigFromCatalog(scenariosCatalog) {
  const next = {};
  for (const [scenarioKey, meta] of Object.entries(scenariosCatalog || {})) {
    const entry = { enabled: true };
    for (const [techKey, tech] of Object.entries(meta.techniques || {})) {
      entry[techKey] = tech.defaultPct;
    }
    next[scenarioKey] = entry;
  }
  return next;
}

function toKb(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) {
    return null;
  }
  return Number((Number(bytes) / 1024).toFixed(1));
}

export default function SimulatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAnalysisId = searchParams.get("analysisId") || "";

  const [history, setHistory] = useState([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(initialAnalysisId);
  const [selectedBaselineSummary, setSelectedBaselineSummary] = useState(null);
  const [catalog, setCatalog] = useState({});
  const [scenarioConfig, setScenarioConfig] = useState({});
  const [simulationName, setSimulationName] = useState(
    "Combined Optimization Scenario"
  );
  const [simulateGreenHosting, setSimulateGreenHosting] = useState(false);

  const [result, setResult] = useState(null);
  const [resultOriginLabel, setResultOriginLabel] = useState("");
  const [comparisonSuite, setComparisonSuite] = useState(null);
  const [savedList, setSavedList] = useState([]);

  const [loadingInit, setLoadingInit] = useState(true);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadInit() {
      setLoadingInit(true);
      setError("");
      try {
        const [histRes, scenariosRes, savedRes] = await Promise.all([
          getAnalysisHistory(30),
          getSimulationScenarios(),
          getSavedSimulations(20),
        ]);
        if (cancelled) return;
        const items = Array.isArray(histRes?.history) ? histRes.history : [];
        setHistory(items);
        setCatalog(scenariosRes);
        setScenarioConfig((prev) =>
          Object.keys(prev).length > 0
            ? prev
            : buildInitialConfigFromCatalog(scenariosRes)
        );
        setSavedList(savedRes);

        const targetId =
          initialAnalysisId || (items.length > 0 ? String(items[0].id) : "");
        if (targetId) {
          setSelectedAnalysisId(targetId);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            getApiErrorMessage(err, "Failed to load simulator baseline data.")
          );
        }
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    }
    loadInit();
    return () => {
      cancelled = true;
    };
  }, [initialAnalysisId]);

  useEffect(() => {
    if (!selectedAnalysisId) return;
    let cancelled = false;
    async function loadSelectedScan() {
      try {
        const rec = await getAnalysisById(selectedAnalysisId);
        if (cancelled) return;
        setSelectedBaselineSummary(rec);
        const greenFlag = Boolean(
          rec?.analysis?.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION
            ?.HOSTING_INFRASTRUCTURE?.IS_GREEN_PROVIDER
        );
        setSimulateGreenHosting(greenFlag);
      } catch (_) {}
    }
    loadSelectedScan();
    return () => {
      cancelled = true;
    };
  }, [selectedAnalysisId]);

  const updateField = (scenarioKey, fieldKey, value) => {
    setScenarioConfig((prev) => ({
      ...prev,
      [scenarioKey]: {
        ...prev[scenarioKey],
        [fieldKey]: value,
      },
    }));
  };

  const handleRunPreview = async () => {
    if (!selectedAnalysisId) {
      setError("Please select a saved scan first.");
      return;
    }
    setError("");
    setSuccessMsg("");
    setRunning(true);
    try {
      const data = await previewSimulation({
        baselineAnalysisId: Number(selectedAnalysisId),
        simulationName,
        simulateGreenHosting,
        includeComparisonSuite: true,
        scenarioConfig,
      });
      setResult(data.simulation);
      setResultOriginLabel("Live Preview Calculation (Not Yet Saved)");
      setComparisonSuite(data.comparisonSuite);
      setSearchParams({ analysisId: selectedAnalysisId });
    } catch (err) {
      setError(getApiErrorMessage(err, "Simulation failed."));
    } finally {
      setRunning(false);
    }
  };

  const handleSaveSimulation = async () => {
    if (!selectedAnalysisId) {
      setError("Please select a saved scan first.");
      return;
    }
    setError("");
    setSuccessMsg("");
    setSaving(true);
    try {
      const data = await saveSimulation({
        baselineAnalysisId: Number(selectedAnalysisId),
        simulationName,
        simulateGreenHosting,
        includeComparisonSuite: true,
        scenarioConfig,
      });
      setResult(data.simulation);
      setResultOriginLabel(`Saved Simulation #${data.simulation?.id}`);
      setComparisonSuite(data.comparisonSuite);
      const updated = await getSavedSimulations(20);
      setSavedList(updated);
      setSuccessMsg(
        `Saved hypothetical simulation #${data.simulation?.id} to MySQL.`
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to save simulation."));
    } finally {
      setSaving(false);
    }
  };

  const categoryChartData = result
    ? [
        {
          name: "Images",
          OriginalKB: toKb(result.baseline.imageBytes),
          SimulatedKB: toKb(result.simulated.imageBytes),
        },
        {
          name: "JavaScript",
          OriginalKB: toKb(result.baseline.scriptBytes),
          SimulatedKB: toKb(result.simulated.scriptBytes),
        },
        {
          name: "CSS",
          OriginalKB: toKb(result.baseline.styleBytes),
          SimulatedKB: toKb(result.simulated.styleBytes),
        },
        {
          name: "Fonts",
          OriginalKB: toKb(result.baseline.fontBytes),
          SimulatedKB: toKb(result.simulated.fontBytes),
        },
        {
          name: "Other",
          OriginalKB: toKb(result.baseline.otherBytes),
          SimulatedKB: toKb(result.simulated.otherBytes),
        },
      ]
    : [];

  const scenarioComparisonChartData = comparisonSuite
    ? [
        {
          name: "A: Images",
          ReductionPct:
            comparisonSuite.individual.imageOptimization.comparison
              .pageWeightReductionPct,
          ScoreGain:
            comparisonSuite.individual.imageOptimization.comparison.scoreDelta,
        },
        {
          name: "B: JS",
          ReductionPct:
            comparisonSuite.individual.javascriptOptimization.comparison
              .pageWeightReductionPct,
          ScoreGain:
            comparisonSuite.individual.javascriptOptimization.comparison
              .scoreDelta,
        },
        {
          name: "C: CSS",
          ReductionPct:
            comparisonSuite.individual.cssOptimization.comparison
              .pageWeightReductionPct,
          ScoreGain:
            comparisonSuite.individual.cssOptimization.comparison.scoreDelta,
        },
        {
          name: "D: Requests",
          ReductionPct:
            comparisonSuite.individual.resourceRequestOptimization.comparison
              .pageWeightReductionPct,
          ScoreGain:
            comparisonSuite.individual.resourceRequestOptimization.comparison
              .scoreDelta,
        },
        {
          name: "Combined",
          ReductionPct:
            comparisonSuite.combined.comparison.pageWeightReductionPct,
          ScoreGain: comparisonSuite.combined.comparison.scoreDelta,
        },
      ]
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-dark font-semibold">
              CarbonLens 2.0 · Module 2
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">
              What-if Optimization Simulator
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Explore hypothetical resource, energy, carbon, and score changes
              using real saved CarbonLens scans as your baseline.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="px-3 py-2 rounded-md border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 self-start"
          >
            Back to Dashboard
          </Link>
        </div>

        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <strong>SIMULATED / HYPOTHETICAL RESULTS:</strong> Outputs calculated
          here are hypothetical projections based on user-configured reduction
          assumptions and the documented CarbonLens estimation formula. They do
          not modify any real website.
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

      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-slate-900">
          1. Baseline Scan &amp; Simulation Name
        </h2>

        {loadingInit ? (
          <p className="text-sm text-slate-500">Loading scans...</p>
        ) : history.length === 0 ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            No saved website scans found.{" "}
            <Link to="/dashboard" className="font-semibold underline">
              Scan a website on the Dashboard first
            </Link>{" "}
            to run simulations on real measurements.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Baseline Saved Scan
              </label>
              <select
                value={selectedAnalysisId}
                onChange={(e) => {
                  setSelectedAnalysisId(e.target.value);
                  setResult(null);
                  setResultOriginLabel("");
                  setComparisonSuite(null);
                  setError("");
                  setSuccessMsg("");
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
              >
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.id} — {item.url} (Score: {item.carbonScore}/100)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Simulation Name
              </label>
              <input
                type="text"
                value={simulationName}
                onChange={(e) => setSimulationName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              />
            </div>
          </div>
        )}

        {selectedBaselineSummary?.analysis && (
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap gap-4">
            <span>
              <strong>Target:</strong> {selectedBaselineSummary.url}
            </span>
            <span>
              <strong>Baseline Weight:</strong>{" "}
              {
                selectedBaselineSummary.analysis
                  ?.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION
                  ?.TOTAL_TRANSMITTED_WEIGHT
              }
            </span>
            <span>
              <strong>Score:</strong>{" "}
              {
                selectedBaselineSummary.analysis
                  ?.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION?.RECONSTRUCTED_METRICS
                  ?.CARBON_EFFICIENCY_SCORE
              }
            </span>
            <span>
              <strong>Requests:</strong>{" "}
              {
                selectedBaselineSummary.analysis
                  ?.PHASE_1_RAW_SOCKET_INTERCEPTION?.INTERCEPTED_TRAFFIC
                  ?.TOTAL_NETWORK_REQUESTS_LOGGED
              }
            </span>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              2. Configure Optimization Scenarios &amp; Assumptions
            </h2>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={simulateGreenHosting}
                onChange={(e) => setSimulateGreenHosting(e.target.checked)}
                className="rounded border-slate-300 text-brand focus:ring-brand"
              />
              Simulate verified green hosting (312 vs 442 gCO₂/kWh)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Object.entries(catalog).map(([scenarioKey, meta]) => {
              const cfg = scenarioConfig[scenarioKey] || {};
              return (
                <div
                  key={scenarioKey}
                  className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/40"
                >
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-semibold text-sm text-slate-900">
                      {meta.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(cfg.enabled)}
                      onChange={(e) =>
                        updateField(scenarioKey, "enabled", e.target.checked)
                      }
                      className="h-4 w-4 accent-brand"
                    />
                  </label>

                  <div className="space-y-2.5">
                    {Object.entries(meta.techniques || {}).map(
                      ([techKey, tech]) => {
                        const val = cfg[techKey] ?? tech.defaultPct;
                        return (
                          <div key={techKey} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-700">{tech.label}</span>
                              <span className="font-semibold text-slate-900">
                                {val}%{" "}
                                <span className="text-slate-400 font-normal">
                                  (max {tech.maxPct}%)
                                </span>
                              </span>
                            </div>
                            <input
                              type="range"
                              min={tech.minPct}
                              max={tech.maxPct}
                              value={val}
                              disabled={!cfg.enabled}
                              onChange={(e) =>
                                updateField(
                                  scenarioKey,
                                  techKey,
                                  Number(e.target.value)
                                )
                              }
                              className="w-full accent-brand disabled:opacity-40"
                            />
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={running}
              onClick={handleRunPreview}
              className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-60"
            >
              {running ? "Simulating..." : "Run What-if Simulation"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSimulation}
              className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Run & Save Simulation to DB"}
            </button>
          </div>
        </section>
      )}

      {result && (
        <section className="space-y-6">
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                SIMULATED · {result.resultType}
                {resultOriginLabel ? ` — ${resultOriginLabel}` : ""}
              </p>
              <p className="text-xs text-amber-800 mt-0.5">{result.disclaimer}</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-white border border-amber-300 text-amber-900">
              Reconciliation Verified:{" "}
              {result.comparison?.reconciliationVerified ? "YES" : "NO"}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase">Page Weight (SIMULATED)</p>
              <p className="text-lg font-semibold text-slate-900 mt-1">
                {result.baseline.pageWeightMB != null
                  ? Number(result.baseline.pageWeightMB).toFixed(2)
                  : "—"}{" "}
                →{" "}
                {result.simulated.pageWeightMB != null
                  ? Number(result.simulated.pageWeightMB).toFixed(2)
                  : "—"}{" "}
                MB
              </p>
              <p className="text-[11px] text-slate-500">
                {result.baseline.totalBytes != null
                  ? Number(result.baseline.totalBytes).toLocaleString()
                  : "—"}{" "}
                →{" "}
                {result.simulated.totalBytes != null
                  ? Number(result.simulated.totalBytes).toLocaleString()
                  : "—"}{" "}
                B
              </p>
              <p className="text-xs text-brand-dark font-medium mt-1">
                -{result.comparison.pageWeightReductionPct}% projected
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase">Requests (SIMULATED)</p>
              <p className="text-lg font-semibold text-slate-900 mt-1">
                {result.baseline.totalRequests ?? "—"} →{" "}
                {result.simulated.totalRequests ?? "—"}
              </p>
              <p className="text-[11px] text-slate-500">
                3P: {result.baseline.thirdPartyRequests ?? "—"} →{" "}
                {result.simulated.thirdPartyRequests ?? "—"}
              </p>
              <p className="text-xs text-brand-dark font-medium mt-1">
                -{result.comparison.requestsReductionPct ?? 0}% projected
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase">
                Est. Energy (SIMULATED)
              </p>
              <p className="text-lg font-semibold text-slate-900 mt-1">
                {result.baseline.energyUsedKWh ?? "—"} →{" "}
                {result.simulated.energyUsedKWh ?? "—"}
              </p>
              <p className="text-[11px] text-slate-500">kWh per visit</p>
              <p className="text-xs text-brand-dark font-medium mt-1">
                -{result.comparison.energyReductionPct}% projected
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase">Est. CO₂ (SIMULATED)</p>
              <p className="text-lg font-semibold text-slate-900 mt-1">
                {result.baseline.co2EstimateGrams != null
                  ? Number(result.baseline.co2EstimateGrams).toFixed(4)
                  : "—"}{" "}
                →{" "}
                {result.simulated.co2EstimateGrams != null
                  ? Number(result.simulated.co2EstimateGrams).toFixed(4)
                  : "—"}{" "}
                g
              </p>
              <p className="text-[11px] text-slate-500">
                Intensity: {result.baseline.carbonIntensity ?? "—"} →{" "}
                {result.simulated.carbonIntensity ?? "—"} gCO₂/kWh
              </p>
              <p className="text-xs text-brand-dark font-medium mt-1">
                -{result.comparison.co2ReductionPct}% projected
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 uppercase">
                Score (SIMULATED)
              </p>
              <p className="text-lg font-semibold text-slate-900 mt-1">
                {result.baseline.carbonScore ?? "—"} →{" "}
                {result.simulated.carbonScore ?? "—"} / 100
              </p>
              <p className="text-xs text-brand-dark font-medium mt-1">
                {result.comparison.scoreDelta >= 0 ? "+" : ""}
                {result.comparison.scoreDelta} pts (Grade {result.simulated.grade})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">
                Original vs. Simulated Asset Weight (KB) — Hypothetical
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} unit=" KB" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="OriginalKB" name="Original (Measured)" fill="#64748b" />
                    <Bar dataKey="SimulatedKB" name="Simulated (Hypothetical)" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {scenarioComparisonChartData.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Scenario Comparison (% Page Weight Reduction) — Hypothetical
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scenarioComparisonChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} unit="%" />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey="ReductionPct"
                        name="Projected Weight Reduction %"
                        fill="#2563eb"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {savedList.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Saved Simulations ({savedList.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2 pr-4">Weight Reduction</th>
                  <th className="py-2 pr-4">Score Change</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {savedList.map((sim) => (
                  <tr key={sim.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium">#{sim.id}</td>
                    <td className="py-2 pr-4">{sim.simulationName}</td>
                    <td className="py-2 pr-4 max-w-xs truncate">{sim.targetUrl}</td>
                    <td className="py-2 pr-4">
                      {sim.comparison?.pageWeightReductionPct ?? "Unavailable"}
                      {sim.comparison?.pageWeightReductionPct != null ? "%" : ""}
                    </td>
                    <td className="py-2 pr-4">
                      {sim.baseline?.carbonScore ?? "—"} →{" "}
                      {sim.simulated?.carbonScore ?? "—"}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setComparisonSuite(null);
                          setError("");
                          setSuccessMsg("");
                          if (sim.baselineAnalysisId) {
                            setSelectedAnalysisId(String(sim.baselineAnalysisId));
                          }
                          if (sim.simulationName) {
                            setSimulationName(sim.simulationName);
                          }
                          if (sim.simulated?.isGreenHost !== undefined) {
                            setSimulateGreenHosting(Boolean(sim.simulated.isGreenHost));
                          }
                          setResult(sim);
                          setResultOriginLabel(`Loaded Saved Simulation #${sim.id}`);
                        }}
                        className="text-brand font-medium hover:underline"
                      >
                        View
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
