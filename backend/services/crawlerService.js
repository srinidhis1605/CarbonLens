// backend/services/crawlerService.js
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({ ignoreAttributes: true });

// Lightweight HTTP fetching (no browser) keeps memory tiny on constrained hosts.
const REQUEST_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (compatible; CarbonLensBot/1.0; +https://carbolens.netlify.app)',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// Cap response size so a single huge document can't blow the memory budget.
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

async function fetchResource(url, timeout = 8000) {
    return axios.get(url, {
        timeout,
        headers: REQUEST_HEADERS,
        responseType: 'text',
        maxRedirects: 5,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        // Inspect status codes ourselves instead of throwing on 4xx/5xx.
        validateStatus: () => true,
        transitional: { clarifyTimeoutError: true },
    });
}

// Static asset/document extensions that are not crawlable "pages" — skip so we don't fetch big
// binaries or count them toward the page total.
const ASSET_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?|avif|css|js|mjs|json|pdf|zip|rar|gz|tar|7z|mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|woff2?|ttf|eot|otf|doc|docx|xls|xlsx|ppt|pptx|csv|rss|txt)$/i;

function looksLikeAsset(pathname) {
    return ASSET_EXTENSION_REGEX.test(pathname || '');
}

/**
 * Normalizes a URL so the same page isn't counted twice (drops hash, query, and trailing slash).
 */
function normalizeInternalUrl(rawUrl, base) {
    const parsed = base ? new URL(rawUrl, base) : new URL(rawUrl);
    parsed.hash = '';
    parsed.search = '';
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${path || '/'}`;
}

/**
 * Extracts anchor href values from a raw HTML string (no DOM/browser needed).
 */
function extractHrefs(html) {
    const hrefs = [];
    if (typeof html !== 'string') return hrefs;

    const anchorRegex = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = anchorRegex.exec(html)) !== null) {
        const href = match[1].trim();
        if (
            href.length > 0 &&
            !href.startsWith('#') &&
            !href.startsWith('javascript:') &&
            !href.startsWith('mailto:') &&
            !href.startsWith('tel:')
        ) {
            hrefs.push(href);
        }
    }
    return hrefs;
}

/**
 * Audits the root domain robots.txt file over plain HTTP.
 *
 * @param {string} rootOrigin - The absolute base origin path (e.g., 'https://example.com')
 * @returns {Promise} Robots parsing report block.
 */
async function auditRobotsTxt(rootOrigin) {
    let fetched = false;
    let isIndexingBlocked = false;
    let discoveredSitemapUrl = null;

    try {
        const response = await fetchResource(`${rootOrigin}/robots.txt`, 6000);

        if (response.status === 200 && typeof response.data === 'string') {
            fetched = true;
            const content = response.data;

            if (/User-agent:\s*\*\s*(?:[\s\S]*?)\bDisallow:\s*\/\s*(?:\r?\n|$)/i.test(content)) {
                isIndexingBlocked = true;
            }

            const sitemapMatch = content.match(/Sitemap:\s*(https?:\/\/[^\s]+)/i);
            if (sitemapMatch) {
                discoveredSitemapUrl = sitemapMatch[1].trim();
            }
        }
    } catch (err) {
        console.warn(`crawlerService: robots.txt look-up failed: ${err.message}`);
    }

    return { found: fetched, globalIndexingBlocked: isIndexingBlocked, extractedSitemap: discoveredSitemapUrl };
}

/**
 * Audits a website's sitemap over plain HTTP, parsing all <loc> URLs and recursing into
 * sitemap-index files.
 *
 * @param {string} sitemapUrl - Absolute URL destination target of the root sitemap.
 * @returns {Promise} Completed sitemap statistics + the list of URLs it lists.
 */
async function auditSitemapXml(sitemapUrl, depth = 0) {
    if (!sitemapUrl) return { found: false, resolvedUrl: null, totalUrls: 0, urls: [] };

    // Cap recursion into nested sitemap-index files so a malicious/huge site can't stall the audit.
    const MAX_INDEX_DEPTH = 2;
    const MAX_CHILD_SITEMAPS = 50;

    if (depth === 0) {
        console.log(`crawlerService: Checking root sitemap: ${sitemapUrl}`);
    }

    let sitemapLoaded = false;
    const urls = [];

    try {
        const response = await fetchResource(sitemapUrl, 8000);

        if (response.status === 200) {
            sitemapLoaded = true;
            const xml = typeof response.data === 'string' ? response.data : String(response.data);
            const parsed = xmlParser.parse(xml);

            const asArray = (val) => (Array.isArray(val) ? val : val != null ? [val] : []);
            const locOf = (entry) => (typeof entry === 'string' ? entry : entry && entry.loc);

            if (parsed && parsed.urlset) {
                // Standard sitemap: collect every <url><loc> entry.
                for (const entry of asArray(parsed.urlset.url)) {
                    const loc = locOf(entry);
                    if (loc) urls.push(String(loc).trim());
                }
            } else if (parsed && parsed.sitemapindex && depth < MAX_INDEX_DEPTH) {
                // Sitemap index: recurse into each child sitemap and merge their URLs.
                const children = asArray(parsed.sitemapindex.sitemap).slice(0, MAX_CHILD_SITEMAPS);
                for (const child of children) {
                    const childUrl = locOf(child);
                    if (!childUrl) continue;
                    const childResult = await auditSitemapXml(childUrl, depth + 1);
                    if (childResult.urls && childResult.urls.length) urls.push(...childResult.urls);
                }
            }
        }
    } catch (err) {
        console.warn(`crawlerService: Sitemap validation failure: ${err.message}`);
    }

    return {
        found: sitemapLoaded,
        resolvedUrl: sitemapUrl,
        totalUrls: urls.length,
        urls,
    };
}

/**
 * Deep-crawls a website over plain HTTP (no browser) to discover all live internal URLs by
 * following anchor links breadth-first. This is memory-light so it can run on constrained hosts.
 */
async function auditLivePages(startUrl, options = {}) {
    // No arbitrary page number drives the crawl — it keeps discovering until the frontier is empty
    // or the time budget runs out. maxPages is only a very high safety ceiling to prevent runaway loops.
    const { maxPages = 500, deadline = Infinity } = options;

    const discoveredUrls = new Set();
    const queue = [];

    try {
        const parsedStart = new URL(startUrl);
        const targetHost = parsedStart.hostname;
        const seed = normalizeInternalUrl(startUrl);

        queue.push(seed);
        discoveredUrls.add(seed);

        console.log(`crawlerService: Commencing HTTP spider crawl for domain: ${targetHost}`);

        while (queue.length > 0 && discoveredUrls.size < maxPages && Date.now() < deadline) {
            const currentUrl = queue.shift();

            try {
                const response = await fetchResource(currentUrl, 8000);
                const contentType = String(response.headers['content-type'] || '').toLowerCase();

                if (response.status !== 200 || !contentType.includes('html')) continue;

                for (const href of extractHrefs(response.data)) {
                    try {
                        const absoluteUrlObj = new URL(href, currentUrl);
                        if (absoluteUrlObj.protocol !== 'http:' && absoluteUrlObj.protocol !== 'https:') continue;
                        if (looksLikeAsset(absoluteUrlObj.pathname)) continue;

                        const cleanUrl = normalizeInternalUrl(absoluteUrlObj.href);

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

        if (Date.now() >= deadline) {
            console.warn(`crawlerService: Crawl time budget reached; discovered ${discoveredUrls.size} pages, ${queue.length} still queued.`);
        }
    } catch (globalError) {
        console.error("crawlerService: Spider framework encountered an exception breakdown:", globalError);
    }

    return Array.from(discoveredUrls);
}

module.exports = { auditRobotsTxt, auditSitemapXml, auditLivePages, normalizeInternalUrl, looksLikeAsset };
