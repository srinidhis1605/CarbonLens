import api from "./api";

export async function runAnalysis(url) {
  const { data } = await api.post("/analysis", { url });
  return data;
}

export async function runSeoAudit(analysisId, url) {
  const { data } = await api.post("/analysis/seo-audit", {
    analysis_id: analysisId,
    url,
  });
  return data;
}

export async function getAnalysisHistory(limit = 20) {
  const { data } = await api.get("/analysis/history", {
    params: { limit },
  });
  return data;
}

export async function getAnalysisById(analysisId) {
  const { data } = await api.get(`/analysis/${analysisId}`);
  return data;
}
