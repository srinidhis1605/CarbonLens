import api from "./api";

export const API_BASE_URL = (
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  ""
).replace(/\/+$/, "");

// =============================================================================
// Module 1: AI Sustainability Agent (/api/v2/agent)
// =============================================================================
export async function analyzeWithAgent({ analysisId, scanData, forceRefresh = false }) {
  const { data } = await api.post("/api/v2/agent/analyze", {
    analysisId,
    scanData,
    forceRefresh,
  });
  return data;
}

export async function getAgentReports(limit = 20) {
  const { data } = await api.get("/api/v2/agent/reports", { params: { limit } });
  return data?.reports || [];
}

export async function getAgentReportByAnalysis(analysisId) {
  const { data } = await api.get(`/api/v2/agent/reports/${analysisId}`);
  return data?.report || null;
}

// =============================================================================
// Module 2: What-if Optimization Simulator (/api/v2/simulations)
// =============================================================================
export async function getSimulationScenarios() {
  const { data } = await api.get("/api/v2/simulations/scenarios");
  return data?.scenarios || {};
}

export async function previewSimulation(payload) {
  const { data } = await api.post("/api/v2/simulations/preview", payload);
  return data;
}

export async function saveSimulation(payload) {
  const { data } = await api.post("/api/v2/simulations", payload);
  return data;
}

export async function getSavedSimulations(limit = 25) {
  const { data } = await api.get("/api/v2/simulations", { params: { limit } });
  return data?.simulations || [];
}

export async function getSimulationById(id) {
  const { data } = await api.get(`/api/v2/simulations/${id}`);
  return data?.simulation || null;
}

// =============================================================================
// Module 3: Actual Website Optimization (/api/v2/optimization)
// =============================================================================
export async function getControlledSiteStatus() {
  const { data } = await api.get("/api/v2/optimization/site-status");
  return data?.site || null;
}

export async function runControlledOptimization(options) {
  const { data } = await api.post("/api/v2/optimization/run", options);
  return data?.run || null;
}

export async function getOptimizationRuns(limit = 20) {
  const { data } = await api.get("/api/v2/optimization/runs", { params: { limit } });
  return data?.runs || [];
}

export async function measureControlledSitesBrowser() {
  const { data } = await api.post("/api/v2/optimization/measure-browser");
  return data?.measurements || null;
}
