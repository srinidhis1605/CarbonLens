// backend/services/crawlerService.js
const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({ ignoreAttributes: true });

/**
 * Audits the root domain robots.txt file using the active Playwright context.
 *
 * @param {import('playwright').Page} browserPage - The active Playwright page slot.
 * @param {string} rootOrigin - The absolute base origin path (e.g., 'https://example.com')
 * @returns {Promise} Robots parsing report block.
 */
async function auditRobotsTxt(browserPage, rootOrigin) {
    let fetched = false;
    let isIndexingBlocked = false;
    let discoveredSitemapUrl = null;

    try {
        // Playwright fetches the raw text resource directly using the active browser session context
        const response = await browserPage.request.get(`${rootOrigin}/robots.txt`, { timeout: 6000 });

        if (response.status() === 200) {
            fetched = true;
            const content = await response.text();

            if (/User-agent:\s*\*\s*(?:[\s\S]*?)\bDisallow:\s*\/\s*(?:\r?\n|$)/i.test(content)) {
                isIndexingBlocked = true;
            }

            const sitemapMatch = content.match(/Sitemap:\s*(https?:\/\/[^\s]+)/i);
            if (sitemapMatch) {
                discoveredSitemapUrl = sitemapMatch[1].trim();
            }
        }
    } catch (err) {
        console.warn(`crawlerService: robots.txt look-up failed via Playwright: ${err.message}`);
    }

    return { found: fetched, globalIndexingBlocked: isIndexingBlocked, extractedSitemap: discoveredSitemapUrl };
}

/**
 * Audits a website's sitemap file visibility using Playwright.
 *
 * @param {import('playwright').Page} browserPage - The active Playwright page slot.
 * @param {string} sitemapUrl - Absolute URL destination target of the root sitemap.
 * @returns {Promise} Completed sitemap statistics.
 */
async function auditSitemapXml(browserPage, sitemapUrl, depth = 0) {
    if (!sitemapUrl) return { found: false, resolvedUrl: null, totalUrls: 0 };

    // Cap recursion into nested sitemap-index files so a malicious/huge site can't stall the audit.
    const MAX_INDEX_DEPTH = 2;
    const MAX_CHILD_SITEMAPS = 50;

    if (depth === 0) {
        console.log(`crawlerService: Checking root sitemap via Playwright: ${sitemapUrl}`);
    }

    let sitemapLoaded = false;
    let totalUrls = 0;

    try {
        const response = await browserPage.request.get(sitemapUrl, { timeout: 8000 });

        if (response.status() === 200) {
            sitemapLoaded = true;
            const xml = await response.text();
            const parsed = xmlParser.parse(xml);

            const asArray = (val) => (Array.isArray(val) ? val : val != null ? [val] : []);
            const locOf = (entry) => (typeof entry === 'string' ? entry : entry && entry.loc);

            if (parsed && parsed.urlset) {
                // Standard sitemap: count the <url> entries directly.
                totalUrls = asArray(parsed.urlset.url).length;
            } else if (parsed && parsed.sitemapindex && depth < MAX_INDEX_DEPTH) {
                // Sitemap index: recurse into each child sitemap and sum their URL counts.
                const children = asArray(parsed.sitemapindex.sitemap).slice(0, MAX_CHILD_SITEMAPS);
                for (const child of children) {
                    const childUrl = locOf(child);
                    if (!childUrl) continue;
                    const childResult = await auditSitemapXml(browserPage, childUrl, depth + 1);
                    totalUrls += childResult.totalUrls || 0;
                }
            }
        }
    } catch (err) {
        console.warn(`crawlerService: Sitemap validation failure via Playwright: ${err.message}`);
    }

    return {
        found: sitemapLoaded,
        resolvedUrl: sitemapUrl,
        totalUrls
    };
}

/**
 * Deep-crawls a website using the active Playwright page context to discover all live internal URLs
 * (including hidden dropdown menus, headers, and footer pages).
 */
async function auditLivePages(browserPage, startUrl, maxPages = 150) {
    const discoveredUrls = new Set();
    const queue = [];

    try {
        const parsedStart = new URL(startUrl);
        const targetHost = parsedStart.hostname;
        const targetOrigin = parsedStart.origin;

        queue.push(targetOrigin);
        discoveredUrls.add(targetOrigin);

        console.log(`crawlerService: Commencing deep spider crawl for domain: ${targetHost}`);

        while (queue.length > 0 && discoveredUrls.size < maxPages) {
            const currentUrl = queue.shift();

            try {
                await browserPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const pageLinks = await browserPage.evaluate(() => {
                    return Array.from(document.querySelectorAll('a'))
                        .map(a => (a.getAttribute('href') || '').trim())
                        .filter(href => href.length > 0 && !href.startsWith('#') && !href.startsWith('javascript:'));
                });

                for (let href of pageLinks) {
                    try {
                        const absoluteUrlObj = new URL(href, currentUrl);
                        absoluteUrlObj.hash = '';
                        absoluteUrlObj.search = '';
                        const cleanUrl = absoluteUrlObj.href;

                        if (absoluteUrlObj.hostname === targetHost && !discoveredUrls.has(cleanUrl)) {
                            if (discoveredUrls.size < maxPages) {
                                discoveredUrls.add(cleanUrl);
                                queue.push(cleanUrl);
                            }
                        }
                    } catch (_) {}
                }
            } catch (navError) {
                console.warn(`crawlerService: Skipped unreachable path [${currentUrl}]: ${navError.message}`);
            }
        }
    } catch (globalError) {
        console.error("crawlerService: Spider framework encountered an exception breakdown:", globalError);
    }

    return Array.from(discoveredUrls);
}

module.exports = { auditRobotsTxt, auditSitemapXml, auditLivePages };