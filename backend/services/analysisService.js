// backend/services/analysisService.js
const { chromium } = require('playwright');
// Imported Phase 1 utility safely at the top
const { extractMetadata } = require('./seoParser');
const { auditRobotsTxt, auditSitemapXml, auditLivePages } = require('./crawlerService');

const analyzeUrl = async (url) => {
    const rootOrigin = new URL(url).origin;

    // 1. Launch a single, unified Playwright browser session
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Explicitly initialize the object structure with guaranteed baseline values
    const metrics = {
        totalBytes: 0,
        imageBytes: 0,
        scriptBytes: 0,
        styleBytes: 0,
        fontBytes: 0,
        totalRequests: 0,
        thirdPartyRequests: 0,
        imageCount: 0,
        scriptCount: 0,
        styleCount: 0,
        fontCount: 0
    };

    let targetDomain = '';
    try {
        targetDomain = new URL(url).hostname.replace('www.', '');
    } catch (e) {
        targetDomain = url;
    }

    // Capture response streams synchronously to avoid the async promise race traps!
    page.on('response', (response) => {
        metrics.totalRequests++;

        // NATIVE SYNC HEADER CAPTURE (This matches your original working code style, no 'await')
        const headers = response.headers();
        const size = parseInt(headers['content-length'], 10) || 0;

        metrics.totalBytes += size;

        // Trace Third Party Domain Vector
        try {
            const requestUrl = new URL(response.url());
            if (!requestUrl.hostname.includes(targetDomain)) {
                metrics.thirdPartyRequests++;
            }
        } catch (err) {}

        // Categorize asset groups based on content-type headers
        const contentType = (headers['content-type'] || '').toLowerCase();

        if (contentType.includes('image')) {
            metrics.imageCount++;
            metrics.imageBytes += size;
        } else if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
            metrics.scriptCount++;
            metrics.scriptBytes += size;
        } else if (contentType.includes('css')) {
            metrics.styleCount++;
            metrics.styleBytes += size;
        } else if (contentType.includes('font')) {
            metrics.fontCount++;
            metrics.fontBytes += size;
        }
    });

    let seoDataPayload = {};
    let totalLivePagesCounted = 0;
    let robotsResult = { found: false, globalIndexingBlocked: false, extractedSitemap: null };
    let sitemapResult = { found: false, resolvedUrl: null };

    try {
        // A. Run the deep dropdown/link spider loop first and capture ALL discovered live page URLs
        const allDiscoveredUrls = await auditLivePages(page, url, 100);

        // B. Run standard Phase 1 & 2 DOM audit on the homepage first
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        console.log("analysisService: Page load settled. Initiating Phase 1 Metadata extraction...");

        seoDataPayload = await extractMetadata(page);

        console.log(`analysisService: Merging legal and social assets across all ${allDiscoveredUrls.length} discovered sub-pages...`);

        // C. SITE-WIDE MERGE LOOP: revisit discovered sub-pages and merge hidden assets into homepage payload
        for (const subUrl of allDiscoveredUrls) {
            if (subUrl === url || subUrl === `${rootOrigin}/` || subUrl === rootOrigin) continue;

            try {
                await page.goto(subUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const subPageData = await extractMetadata(page);

                // --- Merge Legal Compliance Links ---
                if (
                    subPageData.legalCompliance &&
                    subPageData.legalCompliance.privacyPolicy &&
                    subPageData.legalCompliance.privacyPolicy.present &&
                    seoDataPayload.legalCompliance &&
                    seoDataPayload.legalCompliance.privacyPolicy &&
                    !seoDataPayload.legalCompliance.privacyPolicy.present
                ) {
                    seoDataPayload.legalCompliance.privacyPolicy = subPageData.legalCompliance.privacyPolicy;
                }

                if (
                    subPageData.legalCompliance &&
                    subPageData.legalCompliance.termsAndConditions &&
                    subPageData.legalCompliance.termsAndConditions.present &&
                    seoDataPayload.legalCompliance &&
                    seoDataPayload.legalCompliance.termsAndConditions &&
                    !seoDataPayload.legalCompliance.termsAndConditions.present
                ) {
                    seoDataPayload.legalCompliance.termsAndConditions = subPageData.legalCompliance.termsAndConditions;
                }

                if (
                    subPageData.legalCompliance &&
                    subPageData.legalCompliance.disclaimer &&
                    subPageData.legalCompliance.disclaimer.present &&
                    seoDataPayload.legalCompliance &&
                    seoDataPayload.legalCompliance.disclaimer &&
                    !seoDataPayload.legalCompliance.disclaimer.present
                ) {
                    seoDataPayload.legalCompliance.disclaimer = subPageData.legalCompliance.disclaimer;
                }

                // --- Merge Social Links Matrix Profiles ---
                if (subPageData.socialLinks && seoDataPayload.socialLinks) {
                    Object.keys(subPageData.socialLinks).forEach((platform) => {
                        if (subPageData.socialLinks[platform] && !seoDataPayload.socialLinks[platform]) {
                            seoDataPayload.socialLinks[platform] = subPageData.socialLinks[platform];
                        }
                    });
                }

                // --- Merge Unique Meta Keywords ---
                if (Array.isArray(subPageData.keywords) && subPageData.keywords.length > 0) {
                    const existingKeywords = Array.isArray(seoDataPayload.keywords) ? seoDataPayload.keywords : [];
                    const combinedKeywords = [...existingKeywords, ...subPageData.keywords];
                    seoDataPayload.keywords = [...new Set(combinedKeywords)];
                }
            } catch (err) {
                console.warn(`analysisService: Failed site-wide data compilation at [${subUrl}]: ${err.message}`);
            }
        }

        // D. Run the Robots check using the same browser network layer
        robotsResult = await auditRobotsTxt(page, rootOrigin);

        // E. Run the Sitemap check using the discovered or fallback path
        const targetSitemapUrl = robotsResult.extractedSitemap || `${rootOrigin}/sitemap.xml`;
        sitemapResult = await auditSitemapXml(page, targetSitemapUrl);

        totalLivePagesCounted = allDiscoveredUrls.length;

    } catch (error) {
        console.error("analysisService Execution Error:", error);
        throw new Error("Failed to load URL or process analytics metadata pipeline.");
    } finally {
        // Guarantee the browser shuts down under any circumstances to prevent memory bloat
        await browser.close();
    }

    return {
        networkMetrics: metrics,
        seoMetrics: {
            ...seoDataPayload,
            crawlerConfigurations: {
                robotsTxt: {
                    found: robotsResult.found,
                    globalIndexingBlocked: robotsResult.globalIndexingBlocked
                },
                sitemapXml: {
                    found: sitemapResult.found,
                    resolvedUrl: sitemapResult.resolvedUrl,
                    totalLivePagesCounted: totalLivePagesCounted
                }
            }
        }
    };
};

module.exports = { analyzeUrl };