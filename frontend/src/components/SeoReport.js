import React, { useState } from "react";
import AuditChecklistGrid from "./charts/AuditChecklistGrid";

function Stat({ label, value }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900 break-words">
        {value ?? "—"}
      </p>
    </div>
  );
}

function Card({ title, children, right }) {
  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Section({ id, children }) {
  return (
    <div id={id} className="scroll-mt-24">
      {children}
    </div>
  );
}

function Yes({ v }) {
  if (typeof v !== "boolean") return <span>—</span>;
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded ${
        v ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      {v ? "Yes" : "No"}
    </span>
  );
}

function renderTextWithBold(text) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderStructuredSuggestionText(text) {
  if (!text || typeof text !== "string") {
    return <p className="text-sm text-slate-600 mt-1">—</p>;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  const numberedPattern = /(\d+)\.\s+\*\*([^*]+)\*\*:\s*([\s\S]*?)(?=\s+\d+\.\s+\*\*|$)/g;
  const matches = [...normalized.matchAll(numberedPattern)];

  if (matches.length > 0) {
    const firstMatchIndex = matches[0].index ?? 0;
    const intro = normalized.slice(0, firstMatchIndex).trim();

    return (
      <div className="mt-1 space-y-2">
        {intro && (
          <p className="text-sm text-slate-600">{renderTextWithBold(intro)}</p>
        )}
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700">
          {matches.map((m) => (
            <li key={`${m[1]}-${m[2]}`}>
              <span className="font-semibold text-slate-900">{m[2]}</span>
              {m[3] ? <span>: {renderTextWithBold(m[3].trim())}</span> : ""}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const sentenceChunks = normalized
    .split(/(?<=\.)\s+/)
    .filter(Boolean)
    .reduce((acc, sentence) => {
      const current = acc[acc.length - 1];
      if (!current || current.length + sentence.length > 220) {
        acc.push(sentence);
      } else {
        acc[acc.length - 1] = `${current} ${sentence}`;
      }
      return acc;
    }, []);

  return (
    <div className="mt-1 space-y-1.5">
      {sentenceChunks.map((chunk, idx) => (
        <p key={idx} className="text-sm text-slate-600">
          {renderTextWithBold(chunk)}
        </p>
      ))}
    </div>
  );
}

export default function SeoReport({ seo }) {
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  if (!seo) return null;

  const report = seo.SEO_METRICS_REPORT || {};
  const suggestions = Array.isArray(seo.AI_STRUCTURAL_OPTIMIZATIONS)
    ? seo.AI_STRUCTURAL_OPTIMIZATIONS
    : [];

  const social = report.socialGraph || {};
  const legal = report.legalCompliance || {};
  const socialLinks = report.socialLinks || {};
  const semantics = report.semantics || {};
  const headings = semantics.headings || {};
  const images = semantics.images || {};
  const crawlers = report.crawlerConfigurations || {};
  const robots = crawlers.robotsTxt || {};
  const sitemap = crawlers.sitemapXml || {};
  const keywords = Array.isArray(report.keywords) ? report.keywords : [];

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

  const visibleKeywords = showAllKeywords ? keywords : keywords.slice(0, 20);
  const totalHeadings =
    (headings.h1Count ?? 0) + (headings.h2Count ?? 0) + (headings.h3Count ?? 0);

  return (
    <section className="space-y-5">
      <Section id="seo-overview">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Title length" value={report.titleLength ?? "—"} />
          <Stat
            label="Meta desc length"
            value={report.metaDescriptionLength ?? "—"}
          />
          <Stat label="Headings count" value={totalHeadings} />
        </div>
      </Section>

      <Section id="seo-meta">
        <Card title="Meta">
          <p className="text-xs uppercase text-slate-500">Title</p>
          <p className="text-sm text-slate-900 mb-2">{report.title || "—"}</p>
          <p className="text-xs uppercase text-slate-500">Description</p>
          <p className="text-sm text-slate-700 mb-2">
            {report.metaDescription || "—"}
          </p>
          <p className="text-xs uppercase text-slate-500">Canonical</p>
          <p className="text-sm text-slate-700 break-all">
            {report.canonicalUrl || "—"}
          </p>
        </Card>
      </Section>

      <Section id="seo-content-structure">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card title="Headings">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-slate-500">H1</p>
                <p className="font-semibold">{headings.h1Count ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">H2</p>
                <p className="font-semibold">{headings.h2Count ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">H3</p>
                <p className="font-semibold">{headings.h3Count ?? "—"}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Status: <span className="font-medium">{headings.status || "—"}</span>
            </p>
          </Card>

          <Card title="Images">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-slate-500">Total</p>
                <p className="font-semibold">{images.totalImages ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">Missing alt</p>
                <p className="font-semibold">{images.missingAltCount ?? "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">A11y score</p>
                <p className="font-semibold">
                  {images.accessibilityScorePercentage != null
                    ? `${images.accessibilityScorePercentage}%`
                    : "—"}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      <Section id="seo-crawl-legal">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card title="Audit checklist">
            <AuditChecklistGrid
              robots={robots}
              sitemap={sitemap}
              isMobileOptimized={report.isMobileOptimized}
            />
          </Card>

          <Card title="Legal compliance">
            <div className="space-y-2 text-sm">
              {["privacyPolicy", "termsAndConditions", "disclaimer"].map((k) => {
                const item = legal[k] || {};
                return (
                  <div key={k} className="flex justify-between items-center">
                    <span className="text-slate-500 capitalize">
                      {k.replace(/([A-Z])/g, " $1")}
                    </span>
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-brand hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <Yes v={!!item.present} />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </Section>

      <Section id="seo-open-graph">
        <Card title="Open Graph">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="md:col-span-2 space-y-2">
              <div>
                <p className="text-slate-500 text-xs">Title</p>
                <p>{social.ogTitle || "—"}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Description</p>
                <p>{social.ogDescription || "—"}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Type</p>
                <p>{social.ogType || "—"}</p>
              </div>
            </div>
            {social.ogImage ? (
              <img
                src={social.ogImage}
                alt="OG preview"
                className="w-full h-32 object-contain border border-slate-200 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="text-xs text-slate-500">No OG image</div>
            )}
          </div>
        </Card>
      </Section>

      <Section id="seo-social-links">
        <Card title="Social links">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {Object.entries(socialLinks).map(([name, url]) => (
              <div key={name} className="flex items-center justify-between">
                <span className="capitalize text-slate-500">{name}</span>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline text-xs"
                  >
                    Visit
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {keywords.length > 0 && (
        <Section id="seo-keywords">
          <Card
            title={`Keywords (${keywords.length})`}
            right={
              keywords.length > 20 && (
                <button
                  onClick={() => setShowAllKeywords((v) => !v)}
                  className="text-xs text-brand hover:underline"
                >
                  {showAllKeywords ? "Show less" : "Show all"}
                </button>
              )
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {visibleKeywords.map((k, i) => (
                <span
                  key={i}
                  className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                >
                  {k}
                </span>
              ))}
            </div>
          </Card>
        </Section>
      )}

      {suggestions.length > 0 && (
        <Section id="seo-ai-suggestions">
          <Card title="AI structural suggestions">
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
                  {renderStructuredSuggestionText(s.description)}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}
    </section>
  );
}
