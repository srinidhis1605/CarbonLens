/**
 * ============================================================================
 * GreenGrid Interactive Portal — Primary Application Script (Unminified Baseline)
 * Handles interactive category filtering and dynamic traffic footprint preview.
 * This functionality MUST continue working identically after JS optimization.
 * ============================================================================
 */
(function initializeGreenGridPortal() {
    'use strict';

    /**
     * Filters sustainability showcase cards by category tag.
     * @param {string} selectedCategory
     */
    function applyCategoryFilter(selectedCategory) {
        var allCards = document.querySelectorAll('.feature-card');
        var visibleCount = 0;

        for (var index = 0; index < allCards.length; index++) {
            var cardElement = allCards[index];
            var cardCategory = cardElement.getAttribute('data-category') || 'all';
            if (selectedCategory === 'all' || cardCategory === selectedCategory) {
                cardElement.style.display = 'flex';
                visibleCount += 1;
            } else {
                cardElement.style.display = 'none';
            }
        }

        var statusBadge = document.getElementById('filter-status-text');
        if (statusBadge) {
            statusBadge.textContent = 'Showing ' + visibleCount + ' sustainability initiative(s)';
        }
    }

    /**
     * Reads real browser-measured page transfer/body weight for the currently served site version
     * using Navigation + Resource Timing APIs (zero hardcoded default MB).
     */
    function detectMeasuredPageWeightMb() {
        try {
            var navEntries = performance.getEntriesByType('navigation') || [];
            var resEntries = performance.getEntriesByType('resource') || [];
            var totalBytes = 0;
            var countedResources = 0;

            for (var i = 0; i < navEntries.length; i++) {
                var navSize = navEntries[i].transferSize || navEntries[i].encodedBodySize || navEntries[i].decodedBodySize || 0;
                totalBytes += navSize;
                if (navSize > 0) countedResources += 1;
            }
            for (var j = 0; j < resEntries.length; j++) {
                var resSize = resEntries[j].transferSize || resEntries[j].encodedBodySize || resEntries[j].decodedBodySize || 0;
                totalBytes += resSize;
                if (resSize > 0) countedResources += 1;
            }

            if (totalBytes <= 0) return null;
            return {
                totalBytes: totalBytes,
                pageWeightMb: totalBytes / (1024 * 1024),
                resourceCount: countedResources
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Computes an educational energy/CO2 estimate for monthly visitor volume
     * using the measured page weight of the currently loaded website version.
     */
    function recalculateFootprintPreview() {
        var visitsInput = document.getElementById('input-monthly-visits');
        var weightInput = document.getElementById('input-page-weight-mb');
        var outputElement = document.getElementById('estimator-result');
        var sourceNotice = document.getElementById('estimator-source-notice');

        if (!visitsInput || !weightInput || !outputElement) {
            return;
        }

        var measured = detectMeasuredPageWeightMb();
        if ((!weightInput.value || weightInput.dataset.autoDetected !== 'false') && measured) {
            weightInput.value = measured.pageWeightMb.toFixed(4);
            weightInput.dataset.autoDetected = 'true';
        }

        if (sourceNotice) {
            sourceNotice.textContent = measured
                ? 'Measured in browser Performance API: ' +
                  measured.pageWeightMb.toFixed(4) +
                  ' MB (' +
                  measured.totalBytes.toLocaleString() +
                  ' bytes across ' +
                  measured.resourceCount +
                  ' loaded resource(s))'
                : 'Awaiting browser resource timing measurements...';
        }

        var monthlyVisits = Math.max(0, Number(visitsInput.value) || 0);
        var pageWeightMb = Number(weightInput.value);
        if (!Number.isFinite(pageWeightMb) || pageWeightMb <= 0) {
            outputElement.textContent = 'Measured page weight unavailable yet.';
            return;
        }

        // Uses CarbonLens documented educational formula constants: 0.06 kWh/GB and 442 gCO2/kWh
        var totalTransferGb = (monthlyVisits * pageWeightMb) / 1024;
        var estimatedEnergyKwh = totalTransferGb * 0.06;
        var estimatedCo2Kg = (estimatedEnergyKwh * 442) / 1000;

        outputElement.textContent =
            'Estimated monthly transfer: ' +
            totalTransferGb.toFixed(2) +
            ' GB | Calculated energy estimate: ' +
            estimatedEnergyKwh.toFixed(4) +
            ' kWh | Calculated CO2 estimate: ' +
            estimatedCo2Kg.toFixed(4) +
            ' kg CO2';
    }

    function bindInteractiveControls() {
        var filterButtons = document.querySelectorAll('.filter-btn');
        for (var i = 0; i < filterButtons.length; i++) {
            filterButtons[i].addEventListener('click', function onFilterClick(event) {
                var chosenCategory = event.currentTarget.getAttribute('data-filter') || 'all';
                for (var j = 0; j < filterButtons.length; j++) {
                    filterButtons[j].classList.remove('active');
                }
                event.currentTarget.classList.add('active');
                applyCategoryFilter(chosenCategory);
            });
        }

        var weightInput = document.getElementById('input-page-weight-mb');
        if (weightInput) {
            weightInput.addEventListener('input', function onManualWeightInput() {
                weightInput.dataset.autoDetected = 'false';
            });
        }

        var calcButton = document.getElementById('btn-recalculate-preview');
        if (calcButton) {
            calcButton.addEventListener('click', recalculateFootprintPreview);
        }

        applyCategoryFilter('all');
        recalculateFootprintPreview();
        window.addEventListener('load', function onFullLoad() {
            setTimeout(recalculateFootprintPreview, 100);
        });
        window.__GREENGRID_APP_READY__ = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindInteractiveControls);
    } else {
        bindInteractiveControls();
    }
})();
