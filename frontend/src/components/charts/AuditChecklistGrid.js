import React from "react";

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
  const pageCount = sitemap.totalLivePagesCounted;
  const sitemapStatus = sitemap.found
    ? `Found${pageCount != null ? ` (${pageCount} pages)` : ""}`
    : "Not found";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        ok={!!sitemap.found}
      >
        {sitemap.resolvedUrl ? (
          <div className="text-sm">
            <p className="text-slate-500 mb-1">Sitemap URL</p>
            <p className="text-xs text-slate-700 break-all">{sitemap.resolvedUrl}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No sitemap URL detected</p>
        )}
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
