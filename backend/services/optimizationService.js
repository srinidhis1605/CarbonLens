// backend/services/optimizationService.js
// Module 3: Actual Website Optimization Demonstration Engine
// Executes REAL asset transformations on the owned controlled test website:
//   - Images: sharp (resize + compress + convert to WebP + metadata validation)
//   - JavaScript: terser (minification + dead-code elimination + unused script removal + defer)
//   - CSS: clean-css (minification + unused stylesheet removal)
// Strictly preserves research/test-website/original/ untouched.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sharp = require('sharp');
const { minify: terserMinify } = require('terser');
const CleanCSS = require('clean-css');
const { generateControlledTestWebsite } = require('../scripts/generateControlledSite');
const { analyzeUrlPerformanceOnly } = require('./analysisService');
const { calculateSustainabilityMetrics } = require('./normalizationService');

// Prevent libvips from holding open file locks on Windows during repeated runs
sharp.cache(false);

const TEST_SITE_ROOT = path.resolve(__dirname, '../../research/test-website');
const ORIGINAL_DIR = path.join(TEST_SITE_ROOT, 'original');
const OPTIMIZED_DIR = path.join(TEST_SITE_ROOT, 'optimized');

function pctReduction(origBytes, optBytes) {
    if (origBytes === null || origBytes === undefined || origBytes <= 0) return null;
    if (optBytes === null || optBytes === undefined) return null;
    return Number((((origBytes - optBytes) / origBytes) * 100).toFixed(2));
}

function walkFiles(dir, baseDir = dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(full, baseDir));
        } else {
            const stat = fs.statSync(full);
            const rel = path.relative(baseDir, full).replace(/\\/g, '/');
            const ext = path.extname(entry.name).toLowerCase();
            let category = 'other';
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(ext)) category = 'image';
            else if (['.js', '.mjs'].includes(ext)) category = 'javascript';
            else if (ext === '.css') category = 'css';
            else if (ext === '.html') category = 'html';

            results.push({
                relativePath: rel,
                fullPath: full,
                sizeBytes: stat.size,
                ext,
                category,
            });
        }
    }
    return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function summarizeDirectory(dir) {
    const files = walkFiles(dir);
    const totals = {
        totalFiles: files.length,
        totalBytes: 0,
        imageBytes: 0,
        imageCount: 0,
        javascriptBytes: 0,
        javascriptCount: 0,
        cssBytes: 0,
        cssCount: 0,
        htmlBytes: 0,
        htmlCount: 0,
        otherBytes: 0,
        otherCount: 0,
        htmlAndOtherBytes: 0,
        htmlAndOtherCount: 0,
    };

    for (const f of files) {
        totals.totalBytes += f.sizeBytes;
        if (f.category === 'image') {
            totals.imageBytes += f.sizeBytes;
            totals.imageCount += 1;
        } else if (f.category === 'javascript') {
            totals.javascriptBytes += f.sizeBytes;
            totals.javascriptCount += 1;
        } else if (f.category === 'css') {
            totals.cssBytes += f.sizeBytes;
            totals.cssCount += 1;
        } else if (f.category === 'html') {
            totals.htmlBytes += f.sizeBytes;
            totals.htmlCount += 1;
        } else {
            totals.otherBytes += f.sizeBytes;
            totals.otherCount += 1;
        }
    }

    totals.htmlAndOtherBytes = totals.htmlBytes + totals.otherBytes;
    totals.htmlAndOtherCount = totals.htmlCount + totals.otherCount;
    totals.reconciled =
        totals.totalBytes ===
        totals.imageBytes + totals.javascriptBytes + totals.cssBytes + totals.htmlAndOtherBytes;

    return {
        exists: files.length > 0,
        totals,
        files: files.map(({ relativePath, sizeBytes, ext, category }) => ({
            relativePath,
            sizeBytes,
            ext,
            category,
        })),
    };
}

function buildFilesystemComparison(origTotals, optTotals, optExists) {
    if (!optExists) return null;

    const compareCat = (oBytes, nBytes, oCount, nCount) => ({
        originalBytes: oBytes,
        optimizedBytes: nBytes,
        bytesSaved: oBytes - nBytes,
        reductionPct: pctReduction(oBytes, nBytes),
        originalCount: oCount,
        optimizedCount: nCount,
    });

    const images = compareCat(
        origTotals.imageBytes,
        optTotals.imageBytes,
        origTotals.imageCount,
        optTotals.imageCount
    );
    const javascript = compareCat(
        origTotals.javascriptBytes,
        optTotals.javascriptBytes,
        origTotals.javascriptCount,
        optTotals.javascriptCount
    );
    const css = compareCat(
        origTotals.cssBytes,
        optTotals.cssBytes,
        origTotals.cssCount,
        optTotals.cssCount
    );
    const htmlAndOther = compareCat(
        origTotals.htmlAndOtherBytes,
        optTotals.htmlAndOtherBytes,
        origTotals.htmlAndOtherCount,
        optTotals.htmlAndOtherCount
    );

    const sumOrig = images.originalBytes + javascript.originalBytes + css.originalBytes + htmlAndOther.originalBytes;
    const sumOpt = images.optimizedBytes + javascript.optimizedBytes + css.optimizedBytes + htmlAndOther.optimizedBytes;

    return {
        measurementSource: 'filesystem_recursive_scan',
        measurementType: 'MEASURED',
        reconciliationVerified:
            sumOrig === origTotals.totalBytes &&
            sumOpt === optTotals.totalBytes &&
            origTotals.reconciled &&
            optTotals.reconciled,
        total: {
            originalBytes: origTotals.totalBytes,
            optimizedBytes: optTotals.totalBytes,
            bytesSaved: origTotals.totalBytes - optTotals.totalBytes,
            reductionPct: pctReduction(origTotals.totalBytes, optTotals.totalBytes),
            originalFiles: origTotals.totalFiles,
            optimizedFiles: optTotals.totalFiles,
        },
        byCategory: {
            images,
            javascript,
            css,
            htmlAndOther,
        },
    };
}

async function ensureOriginalBaselineExists() {
    if (!fs.existsSync(path.join(ORIGINAL_DIR, 'index.html'))) {
        await generateControlledTestWebsite({ force: false });
    }
}

async function getControlledSiteStatus() {
    await ensureOriginalBaselineExists();
    const original = summarizeDirectory(ORIGINAL_DIR);
    const optimized = summarizeDirectory(OPTIMIZED_DIR);
    const comparison = buildFilesystemComparison(original.totals, optimized.totals, optimized.exists);

    return {
        siteName: 'GreenGrid Sustainability Portal (Controlled Test Website)',
        measurementSource: 'filesystem_recursive_scan',
        measurementType: 'MEASURED',
        measurementTimestamp: new Date().toISOString(),
        originalPath: 'research/test-website/original',
        optimizedPath: 'research/test-website/optimized',
        originalServePath: '/controlled-site/original/',
        optimizedServePath: '/controlled-site/optimized/',
        original,
        optimized,
        comparison,
        availableOperations: [
            {
                id: 'images',
                label: 'Real Image Optimization (Resize + Compress + WebP via sharp)',
                description:
                    'Resizes oversized raster images to realistic display dimensions, compresses and converts PNG/JPEG to WebP, verifies image integrity via sharp metadata, and updates HTML image references.',
            },
            {
                id: 'javascript',
                label: 'Real JavaScript Optimization (Minify + Dead-Code + Remove Unused via terser)',
                description:
                    'Minifies active JavaScript bundles with Terser, removes genuinely unused legacy script from the controlled site HTML, and adds defer loading while preserving full interactivity.',
            },
            {
                id: 'css',
                label: 'Real CSS Optimization (Minify + Remove Unused Stylesheet via clean-css)',
                description:
                    'Minifies active CSS stylesheets with clean-css level 2 optimization and removes the unused legacy stylesheet while preserving visual layout.',
            },
        ],
    };
}

async function withWindowsLockRetry(fn, retries = 4, delayMs = 80) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            const retryable = err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES');
            if (!retryable || attempt === retries) {
                throw err;
            }
            await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        }
    }
    throw lastErr;
}

function createStagingDirectory() {
    const stagingDir = path.join(TEST_SITE_ROOT, `.staging-${Date.now()}-${process.pid}`);
    fs.mkdirSync(path.join(stagingDir, 'assets/images'), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, 'assets/js'), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, 'assets/css'), { recursive: true });
    return stagingDir;
}

/**
 * Verifies every generated HTML asset reference, JS syntax, CSS non-emptiness, and image metadata
 * inside the staging directory before publishing to OPTIMIZED_DIR.
 */
async function verifyStagedSite(stagingDir) {
    const verificationErrors = [];
    const indexPath = path.join(stagingDir, 'index.html');
    if (!fs.existsSync(indexPath) || fs.statSync(indexPath).size === 0) {
        verificationErrors.push({ category: 'html', file: 'index.html', message: 'Staged index.html is missing or empty.' });
        return { verified: false, errors: verificationErrors, checkedRefs: 0 };
    }

    const html = fs.readFileSync(indexPath, 'utf8');
    const refs = [];
    const srcMatches = html.matchAll(/<(?:img|script)\b[^>]*?\bsrc=["']([^"']+)["']/gi);
    for (const m of srcMatches) refs.push(m[1]);
    const hrefMatches = html.matchAll(/<link\b[^>]*?\bhref=["']([^"']+)["']/gi);
    for (const m of hrefMatches) refs.push(m[1]);

    for (const rel of refs) {
        if (/^https?:\/\//i.test(rel) || rel.startsWith('#')) continue;
        const abs = path.join(stagingDir, rel);
        if (!fs.existsSync(abs)) {
            verificationErrors.push({ category: 'html-ref', file: rel, message: `Referenced asset missing in staging: ${rel}` });
            continue;
        }
        const sz = fs.statSync(abs).size;
        if (sz <= 0) {
            verificationErrors.push({ category: 'html-ref', file: rel, message: `Referenced asset is 0 bytes: ${rel}` });
            continue;
        }
        if (/\.js$/i.test(rel)) {
            try {
                new vm.Script(fs.readFileSync(abs, 'utf8'));
            } catch (syntaxErr) {
                verificationErrors.push({ category: 'javascript', file: rel, message: `Invalid JS syntax: ${syntaxErr.message}` });
            }
        } else if (/\.(webp|png|jpe?g|gif|avif)$/i.test(rel)) {
            try {
                const meta = await sharp(abs).metadata();
                if (!meta.width || !meta.height) {
                    verificationErrors.push({ category: 'image', file: rel, message: `Invalid image dimensions for ${rel}` });
                }
            } catch (imgErr) {
                verificationErrors.push({ category: 'image', file: rel, message: `Image metadata check failed: ${imgErr.message}` });
            }
        }
    }

    return {
        verified: verificationErrors.length === 0,
        errors: verificationErrors,
        checkedRefs: refs.length,
    };
}

/**
 * Publishes staged files into OPTIMIZED_DIR WITHOUT deleting OPTIMIZED_DIR itself,
 * avoiding Windows EPERM errors when static servers or browsers access the folder.
 */
async function syncStagingToOptimized(stagingDir, optimizedDir) {
    fs.mkdirSync(path.join(optimizedDir, 'assets/images'), { recursive: true });
    fs.mkdirSync(path.join(optimizedDir, 'assets/js'), { recursive: true });
    fs.mkdirSync(path.join(optimizedDir, 'assets/css'), { recursive: true });

    const stagedFiles = walkFiles(stagingDir);
    const stagedRelSet = new Set(stagedFiles.map((f) => f.relativePath));

    for (const file of stagedFiles) {
        const destAbs = path.join(optimizedDir, file.relativePath);
        fs.mkdirSync(path.dirname(destAbs), { recursive: true });
        const buf = fs.readFileSync(file.fullPath);
        await withWindowsLockRetry(() => fs.writeFileSync(destAbs, buf));
    }

    // Remove obsolete files from previous builds (e.g. old .png/.jpg or removed legacy assets)
    const existingFiles = walkFiles(optimizedDir);
    for (const oldFile of existingFiles) {
        if (!stagedRelSet.has(oldFile.relativePath)) {
            await withWindowsLockRetry(() => fs.unlinkSync(oldFile.fullPath));
        }
    }
}

function copyFileSafe(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

/**
 * Determines sensible display max width per controlled-site image asset.
 */
function targetMaxWidthForImage(filename, globalMaxWidth) {
    if (filename.includes('badge')) return 96;
    if (filename.includes('hero')) return Math.min(globalMaxWidth, 1200);
    return Math.min(globalMaxWidth, 800);
}

/**
 * Executes actual file-level optimization pipeline on the controlled test website.
 * Generates & validates assets in an isolated staging folder, then syncs safely to OPTIMIZED_DIR
 * without deleting OPTIMIZED_DIR itself. Never mutates research/test-website/original/.
 */
async function runControlledOptimization(options = {}) {
    await ensureOriginalBaselineExists();

    const selectedOperations = {
        images: options.images !== false,
        javascript: options.javascript !== false,
        css: options.css !== false,
        imageQuality: Math.min(95, Math.max(40, Number(options.imageQuality) || 75)),
        maxImageWidth: Math.min(2000, Math.max(400, Number(options.maxImageWidth) || 1200)),
        removeUnusedAssets: options.removeUnusedAssets !== false,
    };

    if (!selectedOperations.images && !selectedOperations.javascript && !selectedOperations.css) {
        throw new Error('Select at least one optimization category (images, javascript, or css).');
    }

    const startedAt = new Date().toISOString();
    const originalBefore = summarizeDirectory(ORIGINAL_DIR);
    const originalFiles = walkFiles(ORIGINAL_DIR);
    const stagingDir = createStagingDirectory();

    const operations = [];
    const errors = [];
    const imageReplacements = new Map();
    const jsReplacements = new Map();
    const cssReplacements = new Map();
    const removedAssets = new Set();

    try {
        // 1. IMAGE OPTIMIZATION (sharp -> stagingDir)
        for (const file of originalFiles.filter((f) => f.category === 'image')) {
            const destOriginalName = path.join(stagingDir, file.relativePath);
            if (!selectedOperations.images) {
                copyFileSafe(file.fullPath, destOriginalName);
                continue;
            }

            const parsed = path.parse(file.relativePath);
            const targetRel = `${parsed.dir}/${parsed.name}.webp`;
            const targetAbs = path.join(stagingDir, targetRel);
            const maxWidth = targetMaxWidthForImage(parsed.base, selectedOperations.maxImageWidth);

            try {
                const origMeta = await sharp(file.fullPath).metadata();
                const resizeWidth = origMeta.width && origMeta.width > maxWidth ? maxWidth : origMeta.width;

                await sharp(file.fullPath)
                    .resize({ width: resizeWidth, withoutEnlargement: true })
                    .webp({ quality: selectedOperations.imageQuality, effort: 5 })
                    .toFile(targetAbs);

                const optMeta = await sharp(targetAbs).metadata();
                if (!optMeta || !optMeta.width || !optMeta.height || optMeta.format !== 'webp') {
                    throw new Error('Optimized WebP metadata verification failed.');
                }

                const optSize = fs.statSync(targetAbs).size;
                if (optSize <= 0) {
                    throw new Error('Optimized WebP file is 0 bytes.');
                }

                imageReplacements.set(file.relativePath, {
                    newPath: targetRel,
                    width: optMeta.width,
                    height: optMeta.height,
                });

                operations.push({
                    category: 'image',
                    status: 'SUCCESS',
                    operation: `Resize (${origMeta.width}x${origMeta.height} -> ${optMeta.width}x${optMeta.height}) + Convert ${origMeta.format?.toUpperCase()} to WebP (q=${selectedOperations.imageQuality})`,
                    originalFile: file.relativePath,
                    optimizedFile: targetRel,
                    originalFormat: origMeta.format || file.ext.replace('.', ''),
                    optimizedFormat: optMeta.format,
                    originalDimensions: `${origMeta.width}x${origMeta.height}`,
                    optimizedDimensions: `${optMeta.width}x${optMeta.height}`,
                    originalBytes: file.sizeBytes,
                    optimizedBytes: optSize,
                    bytesSaved: file.sizeBytes - optSize,
                    reductionPct: pctReduction(file.sizeBytes, optSize),
                    verifiedValid: true,
                });
            } catch (err) {
                errors.push({ category: 'image', file: file.relativePath, message: err.message });
                operations.push({
                    category: 'image',
                    status: 'FAILED',
                    operation: 'Image optimization failed',
                    originalFile: file.relativePath,
                    optimizedFile: null,
                    originalBytes: file.sizeBytes,
                    optimizedBytes: file.sizeBytes,
                    bytesSaved: 0,
                    reductionPct: 0,
                    verifiedValid: false,
                    error: err.message,
                });
                copyFileSafe(file.fullPath, destOriginalName);
            }
        }

        // 2. JAVASCRIPT OPTIMIZATION (terser -> stagingDir)
        for (const file of originalFiles.filter((f) => f.category === 'javascript')) {
            const destCopy = path.join(stagingDir, file.relativePath);
            if (!selectedOperations.javascript) {
                copyFileSafe(file.fullPath, destCopy);
                continue;
            }

            const isUnusedLegacy = path.basename(file.relativePath) === 'legacy-unused-widget.js';
            if (isUnusedLegacy && selectedOperations.removeUnusedAssets) {
                removedAssets.add(file.relativePath);
                operations.push({
                    category: 'javascript',
                    status: 'SUCCESS',
                    operation: 'Removed genuinely unused legacy script from controlled website',
                    originalFile: file.relativePath,
                    optimizedFile: '(removed)',
                    originalFormat: 'js',
                    optimizedFormat: 'removed',
                    originalBytes: file.sizeBytes,
                    optimizedBytes: 0,
                    bytesSaved: file.sizeBytes,
                    reductionPct: 100,
                    verifiedValid: true,
                });
                continue;
            }

            const parsed = path.parse(file.relativePath);
            const targetRel = `${parsed.dir}/${parsed.name}.min.js`;
            const targetAbs = path.join(stagingDir, targetRel);

            try {
                const sourceCode = fs.readFileSync(file.fullPath, 'utf8');
                const minified = await terserMinify(sourceCode, {
                    compress: { dead_code: true, drop_console: false, unused: true, passes: 2 },
                    mangle: true,
                    format: { comments: false },
                });

                if (!minified || typeof minified.code !== 'string' || minified.code.length === 0) {
                    throw new Error('Terser returned empty output.');
                }

                // Verify JS syntax validity before accepting
                new vm.Script(minified.code);

                fs.writeFileSync(targetAbs, minified.code, 'utf8');
                const optSize = fs.statSync(targetAbs).size;
                jsReplacements.set(file.relativePath, targetRel);

                operations.push({
                    category: 'javascript',
                    status: 'SUCCESS',
                    operation: 'Terser JS minification, dead-code elimination & defer loading',
                    originalFile: file.relativePath,
                    optimizedFile: targetRel,
                    originalFormat: 'js',
                    optimizedFormat: 'min.js',
                    originalBytes: file.sizeBytes,
                    optimizedBytes: optSize,
                    bytesSaved: file.sizeBytes - optSize,
                    reductionPct: pctReduction(file.sizeBytes, optSize),
                    verifiedValid: true,
                });
            } catch (err) {
                errors.push({ category: 'javascript', file: file.relativePath, message: err.message });
                operations.push({
                    category: 'javascript',
                    status: 'FAILED',
                    operation: 'JavaScript minification failed',
                    originalFile: file.relativePath,
                    optimizedFile: null,
                    originalBytes: file.sizeBytes,
                    optimizedBytes: file.sizeBytes,
                    bytesSaved: 0,
                    reductionPct: 0,
                    verifiedValid: false,
                    error: err.message,
                });
                copyFileSafe(file.fullPath, destCopy);
            }
        }

        // 3. CSS OPTIMIZATION (clean-css -> stagingDir)
        for (const file of originalFiles.filter((f) => f.category === 'css')) {
            const destCopy = path.join(stagingDir, file.relativePath);
            if (!selectedOperations.css) {
                copyFileSafe(file.fullPath, destCopy);
                continue;
            }

            const isUnusedLegacy = path.basename(file.relativePath) === 'legacy-print-unused.css';
            if (isUnusedLegacy && selectedOperations.removeUnusedAssets) {
                removedAssets.add(file.relativePath);
                operations.push({
                    category: 'css',
                    status: 'SUCCESS',
                    operation: 'Removed genuinely unused legacy stylesheet from controlled website',
                    originalFile: file.relativePath,
                    optimizedFile: '(removed)',
                    originalFormat: 'css',
                    optimizedFormat: 'removed',
                    originalBytes: file.sizeBytes,
                    optimizedBytes: 0,
                    bytesSaved: file.sizeBytes,
                    reductionPct: 100,
                    verifiedValid: true,
                });
                continue;
            }

            const parsed = path.parse(file.relativePath);
            const targetRel = `${parsed.dir}/${parsed.name}.min.css`;
            const targetAbs = path.join(stagingDir, targetRel);

            try {
                let sourceCss = fs.readFileSync(file.fullPath, 'utf8');
                if (selectedOperations.removeUnusedAssets) {
                    sourceCss = sourceCss.replace(/\.gg-(?:legacy-helper-block|unused-component-variant)-\d+\s*\{[^}]*\}/g, '');
                }

                const output = new CleanCSS({ level: 2 }).minify(sourceCss);
                if (output.errors && output.errors.length > 0) {
                    throw new Error(output.errors.join('; '));
                }
                if (!output.styles || output.styles.length === 0) {
                    throw new Error('CleanCSS returned empty CSS.');
                }

                fs.writeFileSync(targetAbs, output.styles, 'utf8');
                const optSize = fs.statSync(targetAbs).size;
                cssReplacements.set(file.relativePath, targetRel);

                operations.push({
                    category: 'css',
                    status: 'SUCCESS',
                    operation: selectedOperations.removeUnusedAssets
                        ? 'Purged unused CSS utility rules + CleanCSS level-2 minification'
                        : 'CleanCSS level-2 CSS minification',
                    originalFile: file.relativePath,
                    optimizedFile: targetRel,
                    originalFormat: 'css',
                    optimizedFormat: 'min.css',
                    originalBytes: file.sizeBytes,
                    optimizedBytes: optSize,
                    bytesSaved: file.sizeBytes - optSize,
                    reductionPct: pctReduction(file.sizeBytes, optSize),
                    verifiedValid: true,
                });
            } catch (err) {
                errors.push({ category: 'css', file: file.relativePath, message: err.message });
                operations.push({
                    category: 'css',
                    status: 'FAILED',
                    operation: 'CSS optimization failed',
                    originalFile: file.relativePath,
                    optimizedFile: null,
                    originalBytes: file.sizeBytes,
                    optimizedBytes: file.sizeBytes,
                    bytesSaved: 0,
                    reductionPct: 0,
                    verifiedValid: false,
                    error: err.message,
                });
                copyFileSafe(file.fullPath, destCopy);
            }
        }

        // 4. REWRITE OPTIMIZED HTML IN STAGING
        let html = fs.readFileSync(path.join(ORIGINAL_DIR, 'index.html'), 'utf8');
        html = html.replace(
            'CarbonLens Controlled Test Website (Original)',
            'CarbonLens Controlled Test Website (Optimized)'
        );
        html = html.replace(
            'Controlled Research Baseline Website',
            'Optimized Website Version (Actual Asset Optimization)'
        );
        html = html.replace(
            'Original Unoptimized Baseline (Immutable)',
            'Optimized Output Version — Generated by CarbonLens 2.0'
        );

        for (const removedRel of removedAssets) {
            const escaped = removedRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            html = html.replace(new RegExp(`\\s*<link[^>]+href="${escaped}"[^>]*>\\s*`, 'gi'), '\n');
            html = html.replace(new RegExp(`\\s*<script[^>]+src="${escaped}"[^>]*>\\s*</script>\\s*`, 'gi'), '\n');
        }

        for (const [origRel, info] of imageReplacements.entries()) {
            const escaped = origRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            html = html.replace(new RegExp(`src="${escaped}"`, 'g'), `src="${info.newPath}"`);
        }
        html = html.replace(
            /(<img\b(?![^>]*loading=)(?![^>]*hero-image)(?![^>]*badge-partner)[^>]*?)(\/?>)/gi,
            '$1 loading="lazy" decoding="async" $2'
        );

        for (const [origRel, newRel] of jsReplacements.entries()) {
            const escaped = origRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            html = html.replace(
                new RegExp(`<script\\s+src="${escaped}"><\\/script>`, 'g'),
                `<script src="${newRel}" defer></script>`
            );
        }

        for (const [origRel, newRel] of cssReplacements.entries()) {
            const escaped = origRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            html = html.replace(new RegExp(`href="${escaped}"`, 'g'), `href="${newRel}"`);
        }

        fs.writeFileSync(path.join(stagingDir, 'index.html'), html, 'utf8');

        // 5. VERIFY STAGED ASSETS BEFORE PUBLISHING TO OPTIMIZED_DIR
        const stagingCheck = await verifyStagedSite(stagingDir);
        if (!stagingCheck.verified) {
            errors.push(...stagingCheck.errors);
        }

        // 6. SAFE PUBLISH TO OPTIMIZED_DIR (only if staged verification passed; never rmdir OPTIMIZED_DIR)
        if (stagingCheck.verified) {
            try {
                await syncStagingToOptimized(stagingDir, OPTIMIZED_DIR);
            } catch (syncErr) {
                errors.push({
                    category: 'publish',
                    file: 'research/test-website/optimized',
                    message: `Publish error: ${syncErr.message}`,
                });
            }
        }

        // 7. RECALCULATE FROM LIVE FILESYSTEM (never from stored historical runs)
        const optimizedAfter = summarizeDirectory(OPTIMIZED_DIR);
        const originalAfterCheck = summarizeDirectory(ORIGINAL_DIR);

        const originalPreserved =
            originalBefore.totals.totalBytes === originalAfterCheck.totals.totalBytes &&
            originalBefore.totals.totalFiles === originalAfterCheck.totals.totalFiles;

        const hasFailures = errors.length > 0 || !originalPreserved;
        const status = !hasFailures
            ? 'COMPLETED'
            : operations.some((o) => o.status === 'SUCCESS') && stagingCheck.verified
                ? 'PARTIAL_SUCCESS'
                : 'FAILED';

        const summary = {
            resultType: 'ACTUAL_OPTIMIZATION_RESULT',
            originalPreserved,
            stagingVerified: stagingCheck.verified,
            stagingCheckedRefs: stagingCheck.checkedRefs,
            originalTotalBytes: originalBefore.totals.totalBytes,
            optimizedTotalBytes: optimizedAfter.totals.totalBytes,
            totalBytesSaved: originalBefore.totals.totalBytes - optimizedAfter.totals.totalBytes,
            totalReductionPct: pctReduction(originalBefore.totals.totalBytes, optimizedAfter.totals.totalBytes),
            byCategory: {
                images: {
                    originalBytes: originalBefore.totals.imageBytes,
                    optimizedBytes: optimizedAfter.totals.imageBytes,
                    bytesSaved: originalBefore.totals.imageBytes - optimizedAfter.totals.imageBytes,
                    reductionPct: pctReduction(originalBefore.totals.imageBytes, optimizedAfter.totals.imageBytes),
                    originalCount: originalBefore.totals.imageCount,
                    optimizedCount: optimizedAfter.totals.imageCount,
                },
                javascript: {
                    originalBytes: originalBefore.totals.javascriptBytes,
                    optimizedBytes: optimizedAfter.totals.javascriptBytes,
                    bytesSaved: originalBefore.totals.javascriptBytes - optimizedAfter.totals.javascriptBytes,
                    reductionPct: pctReduction(originalBefore.totals.javascriptBytes, optimizedAfter.totals.javascriptBytes),
                    originalCount: originalBefore.totals.javascriptCount,
                    optimizedCount: optimizedAfter.totals.javascriptCount,
                },
                css: {
                    originalBytes: originalBefore.totals.cssBytes,
                    optimizedBytes: optimizedAfter.totals.cssBytes,
                    bytesSaved: originalBefore.totals.cssBytes - optimizedAfter.totals.cssBytes,
                    reductionPct: pctReduction(originalBefore.totals.cssBytes, optimizedAfter.totals.cssBytes),
                    originalCount: originalBefore.totals.cssCount,
                    optimizedCount: optimizedAfter.totals.cssCount,
                },
                htmlAndOther: {
                    originalBytes: originalBefore.totals.htmlAndOtherBytes,
                    optimizedBytes: optimizedAfter.totals.htmlAndOtherBytes,
                    bytesSaved: originalBefore.totals.htmlAndOtherBytes - optimizedAfter.totals.htmlAndOtherBytes,
                    reductionPct: pctReduction(
                        originalBefore.totals.htmlAndOtherBytes,
                        optimizedAfter.totals.htmlAndOtherBytes
                    ),
                    originalCount: originalBefore.totals.htmlAndOtherCount,
                    optimizedCount: optimizedAfter.totals.htmlAndOtherCount,
                },
            },
            reconciliationVerified:
                originalBefore.totals.reconciled && optimizedAfter.totals.reconciled,
            operationsCount: operations.length,
            succeededCount: operations.filter((o) => o.status === 'SUCCESS').length,
            failedCount: errors.length,
        };

        return {
            siteName: 'controlled-test-website',
            status,
            startedAt,
            completedAt: new Date().toISOString(),
            selectedOperations,
            summary,
            operations,
            errors,
            originalServePath: '/controlled-site/original/',
            optimizedServePath: '/controlled-site/optimized/',
        };
    } finally {
        try {
            if (fs.existsSync(stagingDir)) {
                fs.rmSync(stagingDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) {
            console.warn('[optimizationService] Staging cleanup warning:', cleanupErr.message);
        }
    }
}

/**
 * Measures real browser transfer & timing via Playwright on both controlled website versions
 * and separates MEASURED browser telemetry from CALCULATED energy/CO2 estimates.
 */
async function measureControlledSitesInBrowser({ originalUrl, optimizedUrl }) {
    await ensureOriginalBaselineExists();
    const scanOpts = {
        viewport: { width: 1280, height: 720 },
        waitUntil: 'load',
        settleMs: 600,
        disableCache: true,
        captureAssetDetails: true,
    };

    async function measureSingle(url) {
        const res = await analyzeUrlPerformanceOnly(url, scanOpts);
        const net = res.networkMetrics;
        const speed = res.speedMetrics;
        const calc = calculateSustainabilityMetrics({ totalBytes: net.totalBytes, isGreenHost: false });
        const failedRequests = (res.assetDetails || []).filter((a) => a.status >= 400).length;

        return {
            url,
            measuredBrowser: {
                provenance: 'MEASURED',
                totalBytes: net.totalBytes,
                pageWeightMB: Number(calc.pageWeightMB.toFixed(4)),
                totalRequests: net.totalRequests,
                thirdPartyRequests: net.thirdPartyRequests,
                imageBytes: net.imageBytes,
                imageCount: net.imageCount,
                scriptBytes: net.scriptBytes,
                scriptCount: net.scriptCount,
                styleBytes: net.styleBytes,
                styleCount: net.styleCount,
                fontBytes: net.fontBytes,
                fontCount: net.fontCount,
                otherBytes: net.otherBytes,
                otherCount: net.otherCount,
                timeToFirstByteMs: speed.timeToFirstByteMs,
                domContentLoadedMs: speed.domContentLoadedMs,
                pageLoadTimeMs: speed.pageLoadTimeMs,
                failedRequests,
            },
            calculatedEstimates: {
                provenance: 'CALCULATED',
                energyUsedKWh: calc.energyUsedKWh,
                co2EstimateGrams: calc.co2EstimateGrams,
                co2EstimateGramsPrecise: calc.co2EstimateGramsPrecise,
                carbonScore: calc.carbonScore,
                grade: calc.grade,
                carbonIntensity: calc.carbonIntensity,
            },
            browserConfig: res.browserConfig,
        };
    }

    const original = await measureSingle(originalUrl);
    const hasOptimized = fs.existsSync(path.join(OPTIMIZED_DIR, 'index.html'));
    const optimized = hasOptimized ? await measureSingle(optimizedUrl) : null;

    const comparison = optimized
        ? {
              transferredBytesSaved: original.measuredBrowser.totalBytes - optimized.measuredBrowser.totalBytes,
              transferredReductionPct: pctReduction(
                  original.measuredBrowser.totalBytes,
                  optimized.measuredBrowser.totalBytes
              ),
              requestsSaved: original.measuredBrowser.totalRequests - optimized.measuredBrowser.totalRequests,
              energySavedKWh: Number(
                  (original.calculatedEstimates.energyUsedKWh - optimized.calculatedEstimates.energyUsedKWh).toFixed(8)
              ),
              co2SavedGrams: Number(
                  (
                      original.calculatedEstimates.co2EstimateGramsPrecise -
                      optimized.calculatedEstimates.co2EstimateGramsPrecise
                  ).toFixed(6)
              ),
              scoreDelta: optimized.calculatedEstimates.carbonScore - original.calculatedEstimates.carbonScore,
          }
        : null;

    return {
        measurementTimestamp: new Date().toISOString(),
        measurementSource: 'playwright_chromium_network_and_timing',
        original,
        optimized,
        comparison,
    };
}

module.exports = {
    ORIGINAL_DIR,
    OPTIMIZED_DIR,
    ensureOriginalBaselineExists,
    getControlledSiteStatus,
    runControlledOptimization,
    measureControlledSitesInBrowser,
    summarizeDirectory,
    pctReduction,
};
