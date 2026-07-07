import api from "./api";

// POST /analysis
// Backend returns an object containing DATABASE_RECORD_ID (per spec).
export async function runAnalysis(url) {
  const { data } = await api.post("/analysis", { url });
  return data;
}

// POST /analysis/seo-audit
// Uses the DATABASE_RECORD_ID from the previous /analysis response as analysis_id.
export async function runSeoAudit(analysisId, url) {
  const { data } = await api.post("/analysis/seo-audit", {
    analysis_id: analysisId,
    url,
  });
  return data;
}
