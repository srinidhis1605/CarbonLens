import React, { useEffect, useMemo, useState } from "react";

const PERFORMANCE_STEPS = [
  "Connecting to website",
  "Measuring page weight & speed",
  "Checking green hosting",
  "Calculating carbon score",
  "Opening your report",
];

const SEO_STEPS = [
  "Scanning robots.txt & sitemap",
  "Discovering pages",
  "Analyzing meta & structure",
  "Checking mobile & compliance",
  "Building SEO report",
];

const SEO_DISCOVER_STEP = 1;

function formatHost(url) {
  if (!url) return "your website";
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

export default function AnalysisLoadingOverlay({ active, mode = "performance", url = "" }) {
  const steps = mode === "seo" ? SEO_STEPS : PERFORMANCE_STEPS;
  const stepMs = mode === "seo" ? 4000 : 2500;

  const [currentStep, setCurrentStep] = useState(0);
  const [requests, setRequests] = useState(0);
  const [megabytes, setMegabytes] = useState(0);
  const [pagesFound, setPagesFound] = useState(0);

  const host = useMemo(() => formatHost(url), [url]);

  useEffect(() => {
    if (!active) {
      setCurrentStep(0);
      setRequests(0);
      setMegabytes(0);
      setPagesFound(0);
      return;
    }

    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    }, stepMs);

    return () => clearInterval(stepTimer);
  }, [active, stepMs, steps.length]);

  useEffect(() => {
    if (!active || mode !== "performance") return;

    const statTimer = setInterval(() => {
      setRequests((value) => value + Math.floor(Math.random() * 4) + 1);
      setMegabytes((value) => Math.round((value + Math.random() * 0.08) * 10) / 10);
    }, 450);

    return () => clearInterval(statTimer);
  }, [active, mode]);

  useEffect(() => {
    if (!active || mode !== "seo") return;

    const pageTimer = setInterval(() => {
      setPagesFound((value) => value + Math.floor(Math.random() * 3) + 1);
    }, 500);

    return () => clearInterval(pageTimer);
  }, [active, mode]);

  if (!active) return null;

  const progress = Math.round(((currentStep + 1) / steps.length) * 100);

  function getStepLabel(index, label) {
    if (mode === "seo" && index === SEO_DISCOVER_STEP) {
      const count = pagesFound > 0 ? pagesFound : "…";
      return `Discovering pages (${count} found…)`;
    }
    return label;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={mode === "seo" ? "SEO audit in progress" : "Analysis in progress"}
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div
            className="h-11 w-11 rounded-full border-2 border-brand border-t-transparent animate-spin shrink-0"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {mode === "seo" ? "Running SEO audit" : "Analyzing website"}
            </p>
            <p className="text-xs text-slate-500 truncate">{host}</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>
              Step {currentStep + 1} of {steps.length}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ul className="space-y-2">
          {steps.map((label, index) => {
            const isDone = index < currentStep;
            const isCurrent = index === currentStep;
            const stepLabel = getStepLabel(index, label);

            return (
              <li
                key={index}
                className={`flex items-start gap-2 text-sm transition-colors ${
                  isCurrent
                    ? "text-slate-900 font-medium"
                    : isDone
                      ? "text-slate-600"
                      : "text-slate-400"
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 ${
                    isDone
                      ? "text-brand"
                      : isCurrent
                        ? "text-brand animate-pulse"
                        : "text-slate-300"
                  }`}
                  aria-hidden
                >
                  {isDone ? "✓" : isCurrent ? "→" : "·"}
                </span>
                <span className={isCurrent ? "animate-pulse" : ""}>{stepLabel}</span>
              </li>
            );
          })}
        </ul>

        {mode === "performance" && (
          <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span className="text-brand font-medium">{requests}</span> requests ·{" "}
            <span className="text-brand font-medium">{megabytes.toFixed(1)}</span> MB captured
          </p>
        )}
      </div>
    </div>
  );
}
