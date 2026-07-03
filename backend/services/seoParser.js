// backend/services/seoParser.js

/**
 * Extracts Phase 1 SEO Metadata, keywords, open graph tags, legal pages, and social media handles.
 * @param {import('playwright').Page} page - The active Playwright page instance.
 * @returns {Promise<Object>} Refined metadata profile object with legal and social networks.
 */
async function extractMetadata(page) {
    try {
        console.log("seoParser: Parsing text, tags, compliance, and social channel links...");

        const metadata = await page.evaluate(() => {
            const getMetaAttr = (selector, attr) => {
                const el = document.querySelector(selector);
                return el ? (el.getAttribute(attr) || '').trim() : '';
            };

            // 1. Target Core Meta Tags
            const titleEl = document.querySelector('title');
            const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
            const descText = getMetaAttr('meta[name="description"]', 'content');
            const keywordsText = getMetaAttr('meta[name="keywords"]', 'content');
            const robotsText = getMetaAttr('meta[name="robots"]', 'content') || 'index, follow';
            const canonicalUrl = getMetaAttr('link[rel="canonical"]', 'href');

            // Parse out structured arrays from the keyword strings
            const keywordList = keywordsText 
                ? keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0)
                : [];

            // 2. Target Open Graph (OG) Social Sharing Elements
            const ogTitle = getMetaAttr('meta[property="og:title"]', 'content');
            const ogDescription = getMetaAttr('meta[property="og:description"]', 'content');
            const ogImage = getMetaAttr('meta[property="og:image"]', 'content');
            const ogType = getMetaAttr('meta[property="og:type"]', 'content') || 'website';

            // 3. CRAWLER SCANNER: Gather all <a> anchors for legal pages and social platforms
            const allLinks = Array.from(document.querySelectorAll('a'));
            
            // Legal state place-holders
            let privacyUrl = "";
            let termsUrl = "";
            let disclaimerUrl = "";

            // Social media link profiles placeholders
            let instagramUrl = null;
            let facebookUrl = null;
            let whatsappUrl = null;
            let xUrl = null;
            let linkedinUrl = null;
            let youtubeUrl = null;

            allLinks.forEach(link => {
                const text = (link.textContent || '').trim().toLowerCase();
                const href = (link.getAttribute('href') || '').trim();
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

                // Resolve absolute URLs automatically
                let absoluteUrl = href;
                try {
                    absoluteUrl = new URL(href, window.location.href).href;
                } catch (e) {
                    return; // Skip invalid URL formats safely
                }

                const lowerUrl = absoluteUrl.toLowerCase();

                // --- Compliance Scans ---
                if (/privacy/i.test(text) && !privacyUrl) privacyUrl = absoluteUrl;
                if ((/terms/i.test(text) || /condition/i.test(text)) && !termsUrl) termsUrl = absoluteUrl;
                if (/disclaimer/i.test(text) && !disclaimerUrl) disclaimerUrl = absoluteUrl;

                // --- Social Media Matrix Scans ---
                if ((lowerUrl.includes("instagram.com") || lowerUrl.includes("instagr.am")) && !instagramUrl) {
                    instagramUrl = absoluteUrl;
                }
                if (lowerUrl.includes("facebook.com") && !facebookUrl) {
                    facebookUrl = absoluteUrl;
                }
                if ((lowerUrl.includes("wa.me") || lowerUrl.includes("api.whatsapp.com") || lowerUrl.includes("whatsapp.com")) && !whatsappUrl) {
                    whatsappUrl = absoluteUrl;
                }
                if ((lowerUrl.includes("x.com") || lowerUrl.includes("twitter.com")) && !xUrl) {
                    xUrl = absoluteUrl;
                }
                if (lowerUrl.includes("linkedin.com") && !linkedinUrl) {
                    linkedinUrl = absoluteUrl;
                }
                if ((lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) && !youtubeUrl) {
                    youtubeUrl = absoluteUrl;
                }
            });

            return {
                title: titleText,
                titleLength: titleText.length,
                metaDescription: descText,
                metaDescriptionLength: descText.length,
                robotsDirectives: robotsText,
                canonicalUrl: canonicalUrl,
                keywords: keywordList,
                socialGraph: {
                    ogTitle: ogTitle,
                    ogDescription: ogDescription,
                    ogImage: ogImage,
                    ogType: ogType
                },
                legalCompliance: {
                    privacyPolicy: { present: privacyUrl.length > 0, link: privacyUrl || null },
                    termsAndConditions: { present: termsUrl.length > 0, link: termsUrl || null },
                    disclaimer: { present: disclaimerUrl.length > 0, link: disclaimerUrl || null }
                },
                // NEW: DETECTED SOCIAL CHANNELS OBJECT
                socialLinks: {
                    instagram: instagramUrl,
                    facebook: facebookUrl,
                    whatsapp: whatsappUrl,
                    x: xUrl,
                    linkedin: linkedinUrl,
                    youtube: youtubeUrl
                }
            };
        });

        return metadata;

    } catch (error) {
        console.error("seoParser Error during deep legal and social extraction:", error);
        return {
            title: "Error extracting",
            titleLength: 0,
            metaDescription: "",
            metaDescriptionLength: 0,
            robotsDirectives: "error",
            canonicalUrl: "",
            keywords: [],
            socialGraph: { ogTitle: "", ogDescription: "", ogImage: "", ogType: "website" },
            legalCompliance: {
                privacyPolicy: { present: false, link: null },
                termsAndConditions: { present: false, link: null },
                disclaimer: { present: false, link: null }
            },
            socialLinks: { instagram: null, facebook: null, whatsapp: null, x: null, linkedin: null, youtube: null }
        };
    }
}

module.exports = { extractMetadata };