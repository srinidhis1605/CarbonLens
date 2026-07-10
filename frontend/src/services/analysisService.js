import api from "./api";

export async function runAnalysis(url) {
  const { data } = await api.post("/analysis", { url });
  return data;
}

export async function fetchPerformanceRecommendations(metrics) {
  const { data } = await api.post("/recommendations", { metrics });
  return data?.ADVICE_PAYLOAD || [];
}

export async function saveAiSuggestions(analysisId, suggestions) {
  const { data } = await api.patch(`/analysis/${analysisId}/ai-suggestions`, {
    suggestions,
  });
  return data;
}

export function buildAiMetricsFromAnalysis(analysis) {
  if (analysis?.AI_METRICS_INPUT) {
    const { display, ...metrics } = analysis.AI_METRICS_INPUT;
    return metrics;
  }

  const phase2 = analysis?.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION || {};
  const phase1 = analysis?.PHASE_1_RAW_SOCKET_INTERCEPTION || {};
  const traffic = phase1.INTERCEPTED_TRAFFIC || {};
  const payloads = Array.isArray(phase1.EXTRACTED_PAYLOAD_SIGNATURES)
    ? phase1.EXTRACTED_PAYLOAD_SIGNATURES
    : [];

  const parsePayload = (label) => {
    const item = payloads.find((p) => p.CLASSIFICATION === label);
    const count = Number(item?.COUNT) || 0;
    const mb = parseFloat(String(item?.RAW_WEIGHT || "0").replace(/ MB/i, "")) || 0;
    return { count, bytes: Math.round(mb * 1024 * 1024) };
  };

  const images = parsePayload("BINARY_IMAGES");
  const scripts = parsePayload("CLIENT_JS_SCRIPTS");
  const styles = parsePayload("COMPRESSED_STYLES");
  const fonts = parsePayload("EMBEDDED_FONTS");
  const pageWeightMB =
    parseFloat(String(phase2.TOTAL_TRANSMITTED_WEIGHT || "0").replace(/ MB/i, "")) || 0;
  const carbonScore =
    parseInt(String(phase2.RECONSTRUCTED_METRICS?.CARBON_EFFICIENCY_SCORE || "0"), 10) || 0;

  return {
    pageWeightMB,
    carbonScore,
    co2EstimateGrams: 0,
    rawScrapedData: {
      totalRequests: Number(traffic.TOTAL_NETWORK_REQUESTS_LOGGED) || 0,
      thirdPartyRequests: Number(traffic.FOREIGN_THIRD_PARTY_INJECTIONS) || 0,
      imageCount: images.count,
      imageBytes: images.bytes,
      scriptCount: scripts.count,
      scriptBytes: scripts.bytes,
      styleCount: styles.count,
      styleBytes: styles.bytes,
      fontCount: fonts.count,
      fontBytes: fonts.bytes,
    },
  };
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
