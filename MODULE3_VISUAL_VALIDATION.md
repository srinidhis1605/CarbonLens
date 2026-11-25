# Module 3 — Visual Validation Report

**Controlled Websites Tested:**
- Original: `http://127.0.0.1:5000/controlled-site/original/`
- Optimized: `http://127.0.0.1:5000/controlled-site/optimized/`
- CarbonLens Module 3 UI: `http://localhost:3000/optimization`

**Evidence Artifacts:**
- Original Screenshot: `research/figures/controlled_site_original.png`
- Optimized Screenshot: `research/figures/controlled_site_optimized.png`
- React Module 3 UI Screenshot: `research/figures/module3_optimization_ui.png`

---

## 1. Image Dimensions & Quality Verification (`sharp` + Chromium DOM)

Every optimized WebP image was validated both on disk via `sharp().metadata()` and live inside headless Chromium (`1280x720` / `1366x900` viewports after scrolling to trigger `loading="lazy"`):

| Asset | Original Format & Dimensions | Optimized Format & Dimensions | Rendered Box (Chromium) | Upscaling? | Complete & Loaded |
|---|---|---|---|---|---|
| `badge-partner` | PNG `600x600` (865.37 KB) | WebP `96x96` (0.31 KB) | `36x36` | No (`96 >= 36`) | Yes (`naturalWidth=96`) |
| `hero-banner` | PNG `1800x1012` (4,219.45 KB) | WebP `1200x675` (61.85 KB) | `492x277` | No (`1200 >= 492`) | Yes (`naturalWidth=1200`) |
| `solar-campus` | JPEG `1600x1000` (1,423.37 KB) | WebP `800x500` (15.71 KB) | `362x190` | No (`800 >= 362`) | Yes (`naturalWidth=800`) |
| `dashboard-preview` | PNG `1440x900` (3,315.46 KB) | WebP `800x500` (20.09 KB) | `362x190` | No (`800 >= 362`) | Yes (`naturalWidth=800`) |
| `datacenter-overview` | PNG `1440x900` (3,014.32 KB) | WebP `800x500` (20.15 KB) | `362x190` | No (`800 >= 362`) | Yes (`naturalWidth=800`) |
| `efficiency-report` | PNG `1400x860` (3,216.91 KB) | WebP `800x491` (20.53 KB) | `556x240` | No (`800 >= 556`) | Yes (`naturalWidth=800`) |
| `grid-network` | JPEG `1600x1000` (1,450.65 KB) | WebP `800x500` (14.55 KB) | `556x240` | No (`800 >= 556`) | Yes (`naturalWidth=800`) |

---

## 2. CSS Visual Layout Parity (Original vs. Optimized)

Verified programmatically in `test_module3_verification.js` and visually inspected in `controlled_site_original.png` and `controlled_site_optimized.png`:
- `document.body` background color: identical (`rgb(248, 250, 252)`)
- Primary `<h1>` heading color: identical (`rgb(15, 23, 42)`)
- `.btn-primary` button background: identical (`rgb(22, 163, 74)`)
- `.card-grid` CSS Grid columns (`gridTemplateColumns`): identical 3-column desktop grid
- Broken images: `0` on original, `0` on optimized
- Failed HTTP asset requests: `0` on original, `0` on optimized
- Unused CSS stylesheet `legacy-print-unused.css` (`109.47 KB`) and unused utility blocks in `styles.css` / `components.css` were removed cleanly with zero visual degradation.

---

## 3. React Module 3 UI Visual Inspection (`module3_optimization_ui.png`)

Inspected full-page screenshot of `http://localhost:3000/optimization`:
- **Section 1 (`MEASURED · DISK`)** displays exact original (`17828.77 KB`, `18,256,665 B`, `14 files`) and optimized (`166.94 KB`, `170,946 B`, `12 files`, `-99.06%`) disk totals plus both Recharts bar charts (`Measured Asset Size Comparison on Disk (KB)` and `Disk Category Size Reduction (%) — Measured`, `12` rendered bars).
- **Section 3 (`MEASURED · BROWSER` & `CALCULATED`)** separates Playwright browser telemetry (`18,256,665 B -> 170,946 B`, `14 -> 12` requests, `19ms / 443ms / 683ms -> 17ms / 277ms / 330ms`) from calculated Energy (`0.00102017 -> 0.00000955 kWh`), CO₂ (`0.4509g -> 0.0042g`), and Score (`7/100 -> 98/100`).
- **Execution Log & Saved Runs** show per-file `SUCCESS` badges, dimensions (`600x600 -> 96x96`, `1800x1012 -> 1200x675`, etc.), and persisted MySQL run IDs.
