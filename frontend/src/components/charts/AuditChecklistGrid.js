import React from "react";

function exportDiscoveredPagesToExcel(urls) {
  const escapeCsv = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = `\uFEFFURL\n${urls.map(escapeCsv).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "discovered-pages.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function AuditStatusCard({ label, status, ok, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 h-full">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
            ok ? "bg-green-500" : "bg-red-500"
          }`}
          aria-hidden
        />
        <span className="text-sm font-semibold text-slate-900">{status}</span>
      </div>
      {children && <div className="mt-3 pt-3 border-t border-slate-200">{children}</div>}
    </div>
  );
}

function BoolBadge({ value, trueLabel = "Yes", falseLabel = "No" }) {
  if (typeof value !== "boolean") return <span className="text-sm text-slate-500">—</span>;
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded ${
        value ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
      }`}
    >
      {value ? trueLabel : falseLabel}
    </span>
  );
}

export default function AuditChecklistGrid({ robots, sitemap, isMobileOptimized }) {
  const discoveredPages = Array.isArray(sitemap.discoveredPages)
    ? sitemap.discoveredPages
    : [];
  const pageCount =
    sitemap.totalLivePagesCounted != null
      ? sitemap.totalLivePagesCounted
      : discoveredPages.length || null;
  const sitemapStatus = sitemap.found
    ? `Found${pageCount != null ? ` (${pageCount} pages)` : ""}`
    : "Not found";
  const foundOrCrawled = !!sitemap.found || discoveredPages.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <AuditStatusCard
        label="Robots.txt"
        status={robots.found ? "Found" : "Not found"}
        ok={!!robots.found}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Indexing blocked</span>
          <BoolBadge value={robots.globalIndexingBlocked} trueLabel="Yes" falseLabel="No" />
        </div>
      </AuditStatusCard>

      <AuditStatusCard
        label="Sitemap.xml"
        status={sitemapStatus}
        ok={foundOrCrawled}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-slate-500 mb-1">Sitemap URL</p>
              {sitemap.resolvedUrl ? (
                <p className="text-xs text-slate-700 break-all">{sitemap.resolvedUrl}</p>
              ) : (
                <p className="text-xs text-slate-500">No sitemap URL detected</p>
              )}
            </div>
            {discoveredPages.length > 0 && (
              <button
                type="button"
                onClick={() => exportDiscoveredPagesToExcel(discoveredPages)}
                className="shrink-0 text-xs font-medium text-brand hover:text-brand-dark hover:underline"
              >
                Export to Excel
              </button>
            )}
          </div>

          {discoveredPages.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500 select-none">
                Discovered pages ({discoveredPages.length})
              </summary>
              <ul className="mt-2 max-h-48 overflow-y-auto space-y-1 pr-1">
                {discoveredPages.map((pageUrl) => (
                  <li key={pageUrl}>
                    <a
                      href={pageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline break-all"
                    >
                      {pageUrl}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </AuditStatusCard>

      <AuditStatusCard
        label="Mobile optimized"
        status={
          typeof isMobileOptimized === "boolean"
            ? isMobileOptimized
              ? "Yes"
              : "No"
            : "Unknown"
        }
        ok={isMobileOptimized === true}
      />
    </div>
  );
}
