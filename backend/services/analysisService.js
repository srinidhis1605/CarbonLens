// backend/services/analysisService.js
const { chromium } = require('playwright');
// Imported Phase 1 utility safely at the top
const { extractMetadata } = require('./seoParser');
const { auditRobotsTxt, auditSitemapXml, auditLivePages, normalizeInternalUrl, looksLikeAsset } = require('./crawlerService');

// Low-memory Chromium flags so the browser can run on constrained hosts (e.g. Render free tier, 512MB).
// NOTE: intentionally NOT using --single-process / --no-zygote — they crash Chromium on Linux during
// repeated navigations (deep crawl), which surfaced as 500s on Render.
const CHROMIUM_LAUNCH_OPTIONS = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--mute-audio',
    ],
};

const PERFORMANCE_GOTO_TIMEOUT_MS = Number(process.env.PERFORMANCE_GOTO_TIMEOUT_MS) || 30000;
const PERFORMANCE_SETTLE_MS = Number(process.env.PERFORMANCE_SETTLE_MS) || 1500;

// The BFS spider crawls until its frontier is empty OR this wall-clock time budget elapses — so it
// genuinely visits each reachable URL rather than stopping at a fixed page number.
const SEO_CRAWL_TIME_BUDGET_MS = Number(process.env.SEO_CRAWL_TIME_BUDGET_MS) || 35000;
// Very high safety ceiling only to prevent a runaway/infinite loop on pathological sites.
const SEO_MAX_CRAWL_PAGES = Number(process.env.SEO_MAX_CRAWL_PAGES) || 500;
// How many of the discovered pages we re-visit for full metadata extraction (the memory-heavy step).
const SEO_MAX_METADATA_PAGES = Number(process.env.SEO_MAX_METADATA_PAGES) || 8;

/**
 * METHOD 1: Lightning Fast Performance Profile Scan
 */
async function analyzeUrlPerformanceOnly(url) {
    const rootOrigin = new URL(url).origin;
    const browser = await chromium.launch(CHROMIUM_LAUNCH_OPTIONS);
    const page = await browser.newPage();

    let metrics = {
        totalBytes: 0,
        totalRequests: 0,
        thirdPartyRequests: 0,
        imageCount: 0,
        imageBytes: 0,
        scriptCount: 0,
        scriptBytes: 0,
        styleCount: 0,
        styleBytes: 0,
        fontCount: 0,
        fontBytes: 0
    };

    page.on('response', (response) => {
        try {
            const headers = response.headers();
            const len = headers['content-length'] ? parseInt(headers['content-length'], 10) : 0;
            const resUrl = response.url();
            const type = response.request().resourceType();

            metrics.totalBytes += Number.isFinite(len) ? len : 0;
            metrics.totalRequests += 1;
            if (!resUrl.includes(rootOrigin)) metrics.thirdPartyRequests += 1;

            if (type === 'image') {
                metrics.imageCount += 1;
                metrics.imageBytes += len || 0;
            } else if (type === 'script') {
                metrics.scriptCount += 1;
                metrics.scriptBytes += len || 0;
            } else if (type === 'stylesheet') {
                metrics.styleCount += 1;
                metrics.styleBytes += len || 0;
            } else if (type === 'font') {
                metrics.fontCount += 1;
                metrics.fontBytes += len || 0;
            }
        } catch (_) {}
    });

    // Skip heavy streams — they slow the scan without affecting carbon metrics much.
    await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (type === 'media' || type === 'websocket' || type === 'eventsource') {
            return route.abort();
        }
        return route.continue();
    });

    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: PERFORMANCE_GOTO_TIMEOUT_MS,
        });

        // Short fixed settle — counts in-flight assets without waiting for full load/networkidle.
        await new Promise((resolve) => setTimeout(resolve, PERFORMANCE_SETTLE_MS));

        const timingMetrics = await page.evaluate(() => {
            const [entry] = performance.getEntriesByType('navigation');
            const timing = entry || performance.timing;

            if (!timing) return null;

            // For PerformanceNavigationTiming, values are already relative to navigation start
            // For legacy performance.timing, subtract navigationStart
            const baseTime = entry ? 0 : timing.navigationStart;

            const ttfb = entry
                ? timing.responseStart
                : timing.responseStart - baseTime;

            const domReady = entry
                ? timing.domContentLoadedEventEnd
                : timing.domContentLoadedEventEnd - baseTime;

            const fullyLoaded = entry
                ? timing.loadEventEnd
                : timing.loadEventEnd - baseTime;

            return {
                ttfb: Math.max(0, ttfb || 0),
                domReady: Math.max(0, domReady || 0),
                fullyLoaded: Math.max(0, fullyLoaded || 0)
            };
        });

        // 3. Calculate estimated 4G latency from transferred bytes
        // Baseline: 25 Mbps download = 3,276,800 bytes/sec
        // Fixed RTT overhead = 40ms
        const totalBytes = metrics.totalBytes || 0;
        const speed4GBytesPerSec = (25 * 1024 * 1024) / 8; // 3,276,800 bytes/sec
        const networkRttOverheadMs = 40;

        const calculated4GLatencyMs = Math.round(
            ((totalBytes / speed4GBytesPerSec) * 1000) + networkRttOverheadMs
        );

        return {
            networkMetrics: {
                totalBytes: metrics.totalBytes,
                totalRequests: metrics.totalRequests,
                thirdPartyRequests: metrics.thirdPartyRequests,
                imageCount: metrics.imageCount,
                imageBytes: metrics.imageBytes,
                scriptCount: metrics.scriptCount,
                scriptBytes: metrics.scriptBytes,
                styleCount: metrics.styleCount,
                styleBytes: metrics.styleBytes,
                fontCount: metrics.fontCount,
                fontBytes: metrics.fontBytes
            },
            speedMetrics: {
                timeToFirstByteMs: Math.round(timingMetrics?.ttfb || 0),
                domContentLoadedMs: Math.round(timingMetrics?.domReady || 0),
                pageLoadTimeMs: Math.round(
                    (timingMetrics?.fullyLoaded > 0
                        ? timingMetrics.fullyLoaded
                        : timingMetrics?.domReady) || 0
                ),
                estimated4gLatencyMs: calculated4GLatencyMs
            }
        };
    } finally {
        await browser.close();
    }
}

/**
 * METHOD 2: Core SEO Engine & Crawler Audits (All Phase 2 Content Isolated Here)
 */
async function analyzeUrlSeoSuite(url) {
    const rootOrigin = new URL(url).origin;

    // A. Lightweight HTTP work first — NO browser. Discovery, robots.txt and sitemap.xml are all
    //    plain HTTP fetches, so the memory-heavy part of the audit never touches Chromium.
    //    Bounded by a time budget (not a fixed page count) so it checks each reachable URL.
    const crawledUrls = await auditLivePages(url, {
        maxPages: SEO_MAX_CRAWL_PAGES,
        deadline: Date.now() + SEO_CRAWL_TIME_BUDGET_MS,
    });
    const robotsResult = await auditRobotsTxt(rootOrigin);
    const targetSitemapUrl = robotsResult.extractedSitemap || `${rootOrigin}/sitemap.xml`;
    const sitemapResult = await auditSitemapXml(targetSitemapUrl);

    // B. Browser is launched ONLY for metadata extraction (homepage + a small subset of pages).
    //    Rendering just a handful of pages keeps peak memory well under constrained host limits.
    const browser = await chromium.launch(CHROMIUM_LAUNCH_OPTIONS);
    const page = await browser.newPage();

    let masterSeoResult;
    try {
        // Seed the compilation using the core page elements from the homepage.
        // Use 'domcontentloaded' (reliable) and only *optionally* wait for network idle — sites
        // with continuous third-party requests never reach 'networkidle', so we must not throw on it.
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        masterSeoResult = await extractMetadata(page);

        // Site-Wide Merge Loop: re-visit only a small subset of discovered pages for deep
        // keyword/compliance aggregation (this is the memory-heavy step, so it stays capped).
        const metadataUrls = crawledUrls.slice(0, SEO_MAX_METADATA_PAGES);
        for (const subUrl of metadataUrls) {
            if (subUrl === url || subUrl === `${rootOrigin}/` || subUrl === rootOrigin) continue;

            try {
                await page.goto(subUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const subPageData = await extractMetadata(page);

                if (subPageData.legalCompliance.privacyPolicy.present && !masterSeoResult.legalCompliance.privacyPolicy.present) {
                    masterSeoResult.legalCompliance.privacyPolicy = subPageData.legalCompliance.privacyPolicy;
                }
                if (subPageData.legalCompliance.termsAndConditions.present && !masterSeoResult.legalCompliance.termsAndConditions.present) {
                    masterSeoResult.legalCompliance.termsAndConditions = subPageData.legalCompliance.termsAndConditions;
                }
                if (subPageData.legalCompliance.disclaimer.present && !masterSeoResult.legalCompliance.disclaimer.present) {
                    masterSeoResult.legalCompliance.disclaimer = subPageData.legalCompliance.disclaimer;
                }

                Object.keys(subPageData.socialLinks).forEach(platform => {
                    if (subPageData.socialLinks[platform] && !masterSeoResult.socialLinks[platform]) {
                        masterSeoResult.socialLinks[platform] = subPageData.socialLinks[platform];
                    }
                });

                if (subPageData.keywords && subPageData.keywords.length > 0) {
                    masterSeoResult.keywords = [...new Set([...masterSeoResult.keywords, ...subPageData.keywords])];
                }
            } catch (err) {
                console.warn(`analysisService: SEO extraction skipped at [${subUrl}]: ${err.message}`);
            }
        }
    } finally {
        await browser.close();
    }

    // C. Total live pages = union of everything the BFS spider reached AND everything the
    // sitemap lists (normalized), so neither source alone undercounts the site.
    {
        const safeNormalize = (u) => {
            try {
                const parsed = new URL(u);
                if (looksLikeAsset(parsed.pathname)) return null;
                return normalizeInternalUrl(u);
            } catch (_) {
                return null;
            }
        };
        const uniquePages = new Set();
        for (const u of crawledUrls) {
            const n = safeNormalize(u);
            if (n) uniquePages.add(n);
        }
        for (const u of sitemapResult.urls || []) {
            const n = safeNormalize(u);
            if (n) uniquePages.add(n);
        }
        const discoveredPages = Array.from(uniquePages).sort();
        const totalLivePagesCounted = discoveredPages.length;

        // Construct the exact isolated SEO object block layout you wanted:
        return {
            title: masterSeoResult.title,
            titleLength: masterSeoResult.titleLength,
            metaDescription: masterSeoResult.metaDescription,
            metaDescriptionLength: masterSeoResult.metaDescriptionLength,
            robotsDirectives: masterSeoResult.robotsDirectives,
            canonicalUrl: masterSeoResult.canonicalUrl,
            keywords: masterSeoResult.keywords,
            isMobileOptimized: masterSeoResult.isMobileOptimized,
            socialGraph: masterSeoResult.socialGraph,
            legalCompliance: masterSeoResult.legalCompliance,
            socialLinks: masterSeoResult.socialLinks,

            // EXACTLY WHAT YOU HIGHLIGHTED:
            semantics: masterSeoResult.semantics,
            crawlerConfigurations: {
                robotsTxt: {
                    found: robotsResult.found,
                    globalIndexingBlocked: robotsResult.globalIndexingBlocked
                },
                sitemapXml: {
                    found: sitemapResult.found,
                    resolvedUrl: sitemapResult.resolvedUrl,
                    totalLivePagesCounted,
                    discoveredPages
                }
            }
        };
    }
}

module.exports = { analyzeUrlPerformanceOnly, analyzeUrlSeoSuite };