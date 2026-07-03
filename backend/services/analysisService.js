// backend/services/analysisService.js
const { chromium } = require('playwright');
// Imported Phase 1 utility safely at the top
const { extractMetadata } = require('./seoParser');
const { auditRobotsTxt, auditSitemapXml, auditLivePages } = require('./crawlerService');

/**
 * METHOD 1: Lightning Fast Performance Profile Scan
 */
async function analyzeUrlPerformanceOnly(url) {
    const rootOrigin = new URL(url).origin;
    const browser = await chromium.launch({ headless: true });
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

    page.on('response', async (response) => {
        try {
            const headers = response.headers();
            const len = headers['content-length'] ? parseInt(headers['content-length'], 10) : 0;
            const resUrl = response.url();
            const type = response.request().resourceType();

            metrics.totalBytes += len;
            metrics.totalRequests += 1;
            if (!resUrl.includes(rootOrigin)) metrics.thirdPartyRequests += 1;

            if (type === 'image') {
                metrics.imageCount += 1;
                metrics.imageBytes += len;
            } else if (type === 'script') {
                metrics.scriptCount += 1;
                metrics.scriptBytes += len;
            } else if (type === 'stylesheet') {
                metrics.styleCount += 1;
                metrics.styleBytes += len;
            } else if (type === 'font') {
                metrics.fontCount += 1;
                metrics.fontBytes += len;
            }
        } catch (_) {}
    });

    try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        return { networkMetrics: metrics };
    } finally {
        await browser.close();
    }
}

/**
 * METHOD 2: Core SEO Engine & Crawler Audits (All Phase 2 Content Isolated Here)
 */
async function analyzeUrlSeoSuite(url) {
    const rootOrigin = new URL(url).origin;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // A. Run the deep spider to count all live internal paths across dropdowns/footers
        const allDiscoveredUrls = await auditLivePages(page, url, 100);

        // B. Seed the compilation using the core page elements from the homepage
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        const masterSeoResult = await extractMetadata(page);

        // C. Site-Wide Merge Loop for deep keyword/compliance aggregation
        for (const subUrl of allDiscoveredUrls) {
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

        // D. Global Crawler Lookups (Robots and Sitemaps)
        const robotsResult = await auditRobotsTxt(page, rootOrigin);
        const targetSitemapUrl = robotsResult.extractedSitemap || `${rootOrigin}/sitemap.xml`;
        const sitemapResult = await auditSitemapXml(page, targetSitemapUrl);

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
                    totalLivePagesCounted: allDiscoveredUrls.length
                }
            }
        };
    } finally {
        await browser.close();
    }
}

module.exports = { analyzeUrlPerformanceOnly, analyzeUrlSeoSuite };