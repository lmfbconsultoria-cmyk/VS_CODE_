let lastSnowRunResults = null;

const snowInputIds = [
    'snow_asce_standard', 'snow_unit_system', 'snow_risk_category', 'snow_design_method', 'snow_jurisdiction', 
    'snow_nycbc_minimum_roof_snow_load', 'snow_ground_snow_load', 'snow_surface_roughness_category', 
    'snow_exposure_condition', 'snow_thermal_condition', 'snow_roof_slope_degrees', 'snow_is_roof_slippery', 
    'snow_calculate_unbalanced', 'snow_calculate_drift', 'snow_calculate_sliding', 'snow_eave_to_ridge_distance_W', 
    'snow_is_simply_supported_prismatic', 'snow_winter_wind_parameter_W2', 'snow_upper_roof_length_lu', 
    'snow_height_difference_hc', 'snow_lower_roof_length_ll'
];

document.addEventListener('DOMContentLoaded', () => {
    
    function initializeApp() {
        attachEventListeners();
    }

    function attachEventListeners() {
        function attachDebouncedListeners(ids, handler) {
            const debouncedHandler = debounce(handler, 500);
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', debouncedHandler);
                    el.addEventListener('change', debouncedHandler);
                }
            });
        }

        initializeTheme();
        const handleSaveSnowInputs = createSaveInputsHandler(snowInputIds, 'snow-inputs.txt');
        const handleLoadSnowInputs = createLoadInputsHandler(snowInputIds, handleRunSnowCalculation);

        document.getElementById('run-snow-calculation-btn').addEventListener('click', handleRunSnowCalculation);
        document.getElementById('save-snow-inputs-btn').addEventListener('click', handleSaveSnowInputs);
        document.getElementById('load-snow-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('snow-file-input')); // initiateLoad is already generic
        document.getElementById('snow-file-input').addEventListener('change', handleLoadSnowInputs);

        attachDebouncedListeners(snowInputIds, handleRunSnowCalculation);

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        document.body.addEventListener('click', async (event) => {
            if (event.target.id === 'copy-report-btn') {
                await handleCopyToClipboard('snow-results-container', 'feedback-message');
            }
            if (event.target.id === 'copy-summary-btn') {
                await handleCopySummaryToClipboard('snow-results-container', 'feedback-message');
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            const button = event.target.closest('.toggle-details-btn');
            if (button) {
                const detailId = button.dataset.toggleId;
                const detailRow = document.getElementById(detailId);
                if (detailRow) {
                    detailRow.classList.toggle('is-visible');
                    button.textContent = detailRow.classList.contains('is-visible') ? '[Hide]' : '[Show]';
                }
            }
        });
    }

    initializeApp();
});

const validationRules = {
    snow: {
        'ground_snow_load': { min: 0, max: 300, required: true, label: 'Ground Snow Load' }
    }
};

const snowLoadCalculator = (() => {
    function getSnowFactors(risk, exposure, thermal, surface_roughness) {
        const is_map = {"I": 0.8, "II": 1.0, "III": 1.1, "IV": 1.2};
        const Is = is_map[risk] || 1.0;
        const ce_map = {
            "B": {"Fully Exposed": 0.9, "Partially Exposed": 1.0, "Sheltered": 1.2},
            "C": {"Fully Exposed": 0.9, "Partially Exposed": 1.0, "Sheltered": 1.1},
            "D": {"Fully Exposed": 0.8, "Partially Exposed": 0.9, "Sheltered": 1.0},
            "Above treeline (windswept)": {"Fully Exposed": 0.7, "Partially Exposed": 0.8},
            "Alaska (no trees)": {"Fully Exposed": 0.7, "Partially Exposed": 0.8}
        };
        const Ce = ce_map[surface_roughness]?.[exposure] ?? 1.0;
        const ct_map = {"Heated Structure": 1.0, "Unheated Structure": 1.2};
        const Ct = ct_map[thermal] || 1.0;
        return { Is, Ce, Ct };
    }

    function calculateSlopeFactor(slope_deg, is_slippery, Ct, standard) {
        if (standard === "ASCE 7-22") {
            if (is_slippery) {
                if (slope_deg < 5) return 1.0;
                if (slope_deg > 70) return 0.0;
                return 1.0 - (slope_deg - 5) / 65;
            } else {
                if (slope_deg < 30) return 1.0;
                if (slope_deg > 70) return 0.0;
                return 1.0 - (slope_deg - 30) / 40;
            }
        } else { // ASCE 7-16
            if (Ct <= 1.0) { // Warm Roof
                if (is_slippery) {
                    if (slope_deg < 5) return 1.0;
                    if (slope_deg > 70) return 0.0;
                    return 1.0 - (slope_deg - 5) / 65;
                } else {
                    if (slope_deg < 30) return 1.0;
                    if (slope_deg > 70) return 0.0;
                    return 1.0 - (slope_deg - 30) / 40;
                }
            } else { // Cold Roof
                if (is_slippery) {
                    if (slope_deg < 15) return 1.0;
                    if (slope_deg > 70) return 0.0;
                    return 1.0 - (slope_deg - 15) / 55;
                } else {
                    if (slope_deg < 45) return 1.0;
                    if (slope_deg > 70) return 0.0;
                    return 1.0 - (slope_deg - 45) / 25;
                }
            }
        }
    }
    
    function calculateSnowDensity(pg) {
        if (!isFinite(pg) || pg <= 0) { // Changed pg < 0 to pg <= 0
            // Return a safe, non-zero default if input is invalid or zero to prevent division by zero later.
            return 14.0; 
        }
        let gamma = 0.13 * pg + 14;
        return Math.min(gamma, 30.0);
    }

    function calculateUnbalancedLoads(ps_balanced, pg, slope_deg, standard, W, is_simply_supported, W2, gamma, Is) {
        // Snow drift and unbalanced load calculation per ASCE 7-16/22 Section 7.7
        // Windward and leeward drift, max drift height, upwind fetch
        const slope_ratio_val = Math.tan(slope_deg * Math.PI / 180);
        const min_slope_ratio = 0.5 / 12;
        const mid_slope_ratio = 7 / 12;

        if (slope_ratio_val < min_slope_ratio) {
            return { applicable: false, reason: `Slope is less than 0.5:12, unbalanced loads are not required per ${standard}.` };
        }

        const S = slope_ratio_val > 0 ? 1 / slope_ratio_val : 0;

        // Case for slopes > 7:12 (ASCE 7-16 Fig 7.6-2, Case III)
        if (slope_ratio_val > mid_slope_ratio) {
            if (S <= 0 || gamma <= 0 || pg <= 0 || Is <= 0) return { applicable: false, reason: 'Invalid inputs for surcharge calculation.' };
            
            let hd;
            if (standard === "ASCE 7-22") {
                // ASCE 7-22 uses a different formulation for hd
                hd = 1.5 * ((Math.pow(pg, 0.74) * Math.pow(W, 0.7) * Math.pow(W2, 1.7)) / gamma);
            } else { // ASCE 7-16
                const lu_for_hd = W; // For this case, lu is the horizontal distance from eave to ridge
                const hd_calc = (0.43 * Math.pow(lu_for_hd, 1/3) * Math.pow(pg + 10, 0.25)) - 1.5;
                hd = Is > 0 ? Math.max(0, hd_calc) / Math.pow(Is, 0.5) : 0;
            }
            
            const surcharge_magnitude = (S > 0 && gamma > 0) ? (hd * gamma) / Math.sqrt(S) : 0;
            const surcharge_width = (8/3) * hd * Math.sqrt(S);
            
            return { 
                applicable: true, 
                case: 'C: Slope > 7:12', 
                windward_nominal: 0.0, // Windward side is cleared
                leeward_nominal: ps_balanced, // Leeward side has balanced load + surcharge
                surcharge_magnitude, 
                surcharge_width, 
                hd_unbalanced: hd, 
                S_val: S 
            };
        } 

        // Case for slopes between 0.5:12 and 7:12
        return { 
            applicable: true, 
            case: 'B: 0.5:12 < Slope <= 7:12', 
            windward_nominal: 0.3 * ps_balanced, 
            leeward_nominal: ps_balanced 
        };
    }

    function calculateDriftLoads(pg, lu, hc, pf, standard, W2, lower_roof_length_ll, Is) {
         const gamma = calculateSnowDensity(pg);
         const hb = gamma > 0 ? pf / gamma : 0;
         if (hc <= 0 || hb <= 0 || (hc / hb) <= 0.2) {
             return { applicable: false, reason: 'Drift surcharge not required per h_c/h_b ≤ 0.2.' };
         }

         let hd_final, w_final, pd_nominal;

         if (standard === "ASCE 7-22") {
            const calc_hd_7_22 = (len) => (gamma > 0 && W2 >= 0 && pg > 0 && len > 0) ? 1.5 * ((Math.pow(pg, 0.74) * Math.pow(len, 0.7) * Math.pow(W2, 1.7)) / gamma) : 0;
            let hd_leeward = Math.min(calc_hd_7_22(lu), 0.6 * lower_roof_length_ll);
            let w_leeward = hd_leeward <= hc ? 4 * hd_leeward : (hc > 0 ? (4 * Math.pow(hd_leeward, 2)) / hc : 0);
            w_leeward = Math.min(w_leeward, 8 * hc);
            
            let hd_windward_initial = calc_hd_7_22(lower_roof_length_ll);
            let hd_windward = 0.75 * hd_windward_initial;
            let w_windward = 6 * hd_windward_initial;

            hd_final = Math.max(hd_leeward, hd_windward);
            w_final = (hd_leeward >= hd_windward) ? w_leeward : w_windward;

         } else { // ASCE 7-16
            const calc_hd_7_16 = (len, pg_val, is_val) => (pg_val >= 0 && len > 0 && is_val > 0) ? Math.max(0, (0.43 * Math.pow(len, 1/3) * Math.pow(pg_val + 10, 0.25)) - 1.5) / Math.pow(is_val, 0.5) : 0;
            let hd_leeward = Math.min(calc_hd_7_16(lu, pg, Is), 0.6 * lower_roof_length_ll);
            let hd_windward = 0.75 * calc_hd_7_16(lower_roof_length_ll, pg, Is);
            let hd_controlling = Math.max(hd_leeward, hd_windward);
            hd_final = hd_controlling; // In 7-16, hd is directly used.
            let w_calc = hd_controlling <= hc ? 4 * hd_controlling : (hc > 0 ? (4 * Math.pow(hd_controlling, 2)) / hc : 0);
            w_final = Math.min(w_calc, 8 * hc);
         }
         
         pd_nominal = hd_final * gamma;
         return { applicable: true, gamma, hb, hd: hd_final, w: w_final, pd_nominal };
    }

    function calculateSlidingSnowLoad(pf, W, Cs, is_slippery, unit_system) {
        // Per ASCE 7-16/22 Section 7.13
        if (!is_slippery || Cs === 1.0) {
            return {
                applicable: false,
                reason: "Sliding snow is only considered for slippery roofs where the slope factor Cs is less than 1.0."
            };
        }

        if (!isFinite(W) || W <= 0) {
            return {
                applicable: false,
                reason: "Eave-to-ridge distance (W) must be positive to calculate sliding snow."
            };
        }

        const Ws = 0.4 * pf * W; // Total sliding load (force per unit length of eave)
        const distribution_width = unit_system === 'imperial' ? 15.0 : 4.6; // ft or m
        const ps_sliding = distribution_width > 0 ? Ws / distribution_width : 0; // Uniform load intensity on lower roof
        return { applicable: true, Ws, distribution_width, ps_sliding };
    }

function run(inputs, validation) {
         // Add jurisdiction-specific warnings
         if (inputs.jurisdiction === "NYCBC 2022") {
             const nycbc_min_pg = 25; // NYCBC 1608.2 specifies pg >= 25 psf (or 30 psf in some areas)
             if (inputs.ground_snow_load < nycbc_min_pg) {
                 validation.warnings.push(`The input ground snow load (p_g = ${inputs.ground_snow_load} psf) is less than the NYCBC 2022 minimum of ${nycbc_min_pg} psf. Verify the correct jurisdictional value.`);
             }
         }
         const { Is, Ce, Ct } = getSnowFactors(inputs.risk_category, inputs.exposure_condition, inputs.thermal_condition, inputs.surface_roughness_category);
         const Cs = calculateSlopeFactor(inputs.roof_slope_degrees || 0, inputs.is_roof_slippery, Ct || 1.0, inputs.asce_standard);
         const pf = 0.7 * (Ce || 1.0) * (Ct || 1.0) * (Is || 1.0) * (inputs.ground_snow_load || 0);
         const ps_calculated = Cs * pf;
         
         let ps_min_asce7 = 0;
         const is_low_slope = inputs.roof_slope_degrees < 15;
         if (is_low_slope) {
            // ASCE 7-16/22 Section 7.3.4
            if (inputs.ground_snow_load <= 20) {
                ps_min_asce7 = inputs.ground_snow_load * Is;
            } else {
                ps_min_asce7 = 20 * Is;
            }
         }
         
         const ps_asce7 = is_low_slope ? Math.max(ps_calculated, ps_min_asce7) : ps_calculated;
         
         let ps_balanced = ps_asce7;
         let is_nycbc_min_governed = false;
         if (inputs.jurisdiction === "NYCBC 2022" && ps_balanced < inputs.nycbc_minimum_roof_snow_load) {
             ps_balanced = inputs.nycbc_minimum_roof_snow_load;
             is_nycbc_min_governed = true;
         }
        
         let unbalanced_results = {};
         if (inputs.calculate_unbalanced) {
             const gamma = calculateSnowDensity(inputs.ground_snow_load);
             unbalanced_results = calculateUnbalancedLoads(ps_balanced, inputs.ground_snow_load, inputs.roof_slope_degrees, inputs.asce_standard, inputs.eave_to_ridge_distance_W, inputs.is_simply_supported_prismatic, inputs.winter_wind_parameter_W2, gamma, Is);
         }

         let drift_results = {};
         if (inputs.calculate_drift) {
             drift_results = calculateDriftLoads(inputs.ground_snow_load, inputs.upper_roof_length_lu, inputs.height_difference_hc, pf, inputs.asce_standard, inputs.winter_wind_parameter_W2, inputs.lower_roof_length_ll, Is);
         }

         let sliding_snow_results = {};
         if (inputs.calculate_sliding) {
             sliding_snow_results = calculateSlidingSnowLoad(pf, inputs.eave_to_ridge_distance_W, Cs, inputs.is_roof_slippery, inputs.unit_system);
         }

         let partial_load_results = {};
         if (!inputs.is_simply_supported_prismatic) {
             partial_load_results = {
                 applicable: true,
                 load_on_adjacent_span: 0.5 * ps_balanced,
                 note: "For continuous/cantilevered members, check a case with full balanced load on one span and 0.5 times the balanced load on the adjacent span (ASCE 7-16/22 Sec. 7.8)."
             };
         }

         return {
            inputs,
            intermediate: { Is, Ce, Ct, Cs, pf, ps_asce7, ps_min_asce7, is_low_slope, asce7_min_governed: ps_asce7 > ps_calculated, ps_calculated },
            results: { ps_balanced_nominal: ps_balanced },
            unbalanced: unbalanced_results, drift: drift_results, partial: partial_load_results, sliding: sliding_snow_results,
            is_nycbc_min_governed,
            warnings: validation.warnings,
            success: true
        };
    }

    return { run };
})();

function handleRunSnowCalculation() {
    const rawInputs = gatherInputsFromIds(snowInputIds);
    
    // Sanitize and map inputs to a clean object, preventing NaN issues
    const inputs = {
        ground_snow_load: parseFloat(rawInputs.snow_ground_snow_load) || 0,
        nycbc_minimum_roof_snow_load: parseFloat(rawInputs.snow_nycbc_minimum_roof_snow_load) || 0,
        roof_slope_degrees: parseFloat(rawInputs.snow_roof_slope_degrees) || 0,
        eave_to_ridge_distance_W: parseFloat(rawInputs.snow_eave_to_ridge_distance_W) || 0,
        winter_wind_parameter_W2: parseFloat(rawInputs.snow_winter_wind_parameter_W2) || 0,
        upper_roof_length_lu: parseFloat(rawInputs.snow_upper_roof_length_lu) || 0,
        height_difference_hc: parseFloat(rawInputs.snow_height_difference_hc) || 0,
        lower_roof_length_ll: parseFloat(rawInputs.snow_lower_roof_length_ll) || 0,
        is_roof_slippery: rawInputs.snow_is_roof_slippery === 'Yes',
        calculate_unbalanced: rawInputs.snow_calculate_unbalanced === 'Yes',
        calculate_drift: rawInputs.snow_calculate_drift === 'Yes',
        calculate_sliding: rawInputs.snow_calculate_sliding === 'Yes',
        is_simply_supported_prismatic: rawInputs.snow_is_simply_supported_prismatic === 'Yes',
        asce_standard: rawInputs.snow_asce_standard,
        unit_system: rawInputs.snow_unit_system,
        risk_category: rawInputs.snow_risk_category,
        design_method: rawInputs.snow_design_method,
        jurisdiction: rawInputs.snow_jurisdiction,
        surface_roughness_category: rawInputs.snow_surface_roughness_category,
        exposure_condition: rawInputs.snow_exposure_condition,
        thermal_condition: rawInputs.snow_thermal_condition
    };
    
    const validation = validateInputs(inputs, validationRules.snow);
    if (validation.errors.length > 0) {
        renderValidationResults(validation, document.getElementById('snow-results-container'));
        return;
    }

    setLoadingState(true, 'run-snow-calculation-btn'); // Assumes setLoadingState is in shared-utils.js
    const results = safeCalculation(
        () => snowLoadCalculator.run(inputs, validation),
        'An unexpected error occurred during the snow calculation.'
    );
    if (results.error) {
        setLoadingState(false, 'run-snow-calculation-btn');
        renderValidationResults({ errors: [results.error] }, document.getElementById('snow-results-container'));
        return;
    }
    renderSnowResults(results);
    setLoadingState(false, 'run-snow-calculation-btn');
}

function renderSnowResults(results) {
     if (!results || !results.success) return;
     lastSnowRunResults = results;

     const resultsContainer = document.getElementById('snow-results-container');
     const { inputs, intermediate, is_nycbc_min_governed, unbalanced, drift, sliding, warnings } = results;
     const { ps_balanced_nominal } = results.results; // Final governing load
     const p_unit = inputs.unit_system === 'imperial' ? 'psf' : 'kPa';
     const f_unit = inputs.unit_system === 'imperial' ? 'plf' : 'kN/m';
     const l_unit_long = inputs.unit_system === 'imperial' ? 'feet' : 'meters';
     const l_unit = inputs.unit_system === 'imperial' ? 'ft' : 'm';

     let html = `<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
     html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2">
                    <button id="copy-summary-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Copy Summary</button>
                    <button id="print-report-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm">Print Full Report</button>
                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
              </div>`;

     html += `
        <div class="text-center border-b pb-4">
            <h2 class="text-2xl font-bold">SNOW LOAD CALCULATION REPORT (${inputs.asce_standard})</h2>
        </div>`;

    if (inputs.jurisdiction === "NYCBC 2022") {
        const note = is_nycbc_min_governed ? `The calculated roof snow load was less than the specified NYCBC minimum of ${inputs.nycbc_minimum_roof_snow_load} psf. The NYCBC minimum has been applied.` : "The calculated roof snow load meets or exceeds the specified NYCBC minimum.";
        html += `<div class="bg-blue-100 dark:bg-blue-900/50 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-4 rounded-md"><p><strong>Jurisdiction Note:</strong> ${note}</p></div>`;
    }
    if (warnings && warnings.length > 0) {
        html += renderValidationResults({ warnings, errors: [] });
    }

    // --- 1. DESIGN PARAMETERS ---
    html += `<div class="mt-6 report-section-copyable">
                <h3 class="text-xl font-bold uppercase">1. Design Parameters</h3>
                 <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                 <ul class="list-disc list-inside space-y-1">
                     <li><strong>Risk Category:</strong> ${sanitizeHTML(inputs.risk_category)} <span class="ref">[ASCE 7, Table 1.5-1]</span></li>
                     <li><strong>Ground Snow Load (p<sub>g</sub>):</strong> ${inputs.ground_snow_load.toFixed(2)} ${p_unit} <span class="ref">[User Input / ASCE 7 Fig. 7.2-1]</span></li>
                     ${inputs.jurisdiction === "NYCBC 2022" ? `<li><strong>NYCBC Minimum Roof Snow Load (p<sub>s,min,nycbc</sub>):</strong> ${inputs.nycbc_minimum_roof_snow_load.toFixed(2)} ${p_unit} <span class="ref">[NYCBC, SEC. 1608.1]</span></li>` : ''}
                     <li><strong>Surface Roughness:</strong> ${sanitizeHTML(inputs.surface_roughness_category)} <span class="ref">[ASCE 7, Sec. 7.3]</span></li>
                     <li><strong>Exposure Condition:</strong> ${sanitizeHTML(inputs.exposure_condition)} <span class="ref">[ASCE 7, Sec. 7.3]</span></li>
                     <li><strong>Thermal Condition:</strong> ${sanitizeHTML(inputs.thermal_condition)} <span class="ref">[ASCE 7, Sec. 7.3]</span></li>
                     <li><strong>Roof Slope:</strong> ${inputs.roof_slope_degrees.toFixed(2)} degrees <span class="ref">[ASCE 7, Sec. 7.4]</span></li>
                     <li><strong>Slippery Roof?:</strong> ${inputs.is_roof_slippery ? 'Yes' : 'No'} <span class="ref">[ASCE 7, Sec. 7.4]</span></li>
                     ${inputs.calculate_unbalanced ? `<li><strong>Eave to Ridge Distance (W):</strong> ${inputs.eave_to_ridge_distance_W.toFixed(2)} ${l_unit}</li>` : ''}
                     ${inputs.calculate_unbalanced ? `<li><strong>Simply Supported Prismatic?:</strong> ${inputs.is_simply_supported_prismatic ? 'Yes' : 'No'}</li>` : ''}
                     ${inputs.calculate_drift ? `<li><strong>Upper Roof Length (l<sub>u</sub>):</strong> ${inputs.upper_roof_length_lu.toFixed(2)} ${l_unit}</li>` : ''}
                     ${inputs.calculate_drift ? `<li><strong>Height Difference (h<sub>c</sub>):</strong> ${inputs.height_difference_hc.toFixed(2)} ${l_unit}</li>` : ''}
                     ${inputs.calculate_drift ? `<li><strong>Lower Roof Length (l<sub>l</sub>):</strong> ${inputs.lower_roof_length_ll.toFixed(2)} ${l_unit}</li>` : ''}
                     <li><strong>Importance Factor (I<sub>s</sub>):</strong> ${intermediate.Is.toFixed(2)} <span class="ref">[ASCE 7, Table 1.5-2]</span></li>
                 </ul>
             </div>`;

    // --- 2. DETAILED CALCULATION BREAKDOWN ---
    html += `<div class="mt-6">
                <h3 class="text-xl font-bold uppercase">2. Detailed Calculation Breakdown</h3>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <div class="calc-breakdown">
                    <h4 class="font-semibold uppercase text-base">a) Balanced Snow Load Calculation</h4>
                    <ul class="list-disc list-inside space-y-2 mt-2">
                        <li><strong>Factors:</strong> I<sub>s</sub> = ${intermediate.Is.toFixed(2)}, C<sub>e</sub> = ${intermediate.Ce.toFixed(2)}, C<sub>t</sub> = ${intermediate.Ct.toFixed(2)}, C<sub>s</sub> = ${intermediate.Cs.toFixed(3)}</li>
                        <li><strong>Flat Roof Snow Load (p<sub>f</sub>):</strong>
                            <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">p<sub>f</sub> = 0.7 &times; C<sub>e</sub> &times; C<sub>t</sub> &times; I<sub>s</sub> &times; p<sub>g</sub> = 0.7 &times; ${intermediate.Ce.toFixed(2)} &times; ${intermediate.Ct.toFixed(2)} &times; ${intermediate.Is.toFixed(2)} &times; ${inputs.ground_snow_load.toFixed(2)} = <b>${intermediate.pf.toFixed(2)} ${p_unit}</b></div>
                        </li>
                        <li><strong>Sloped Roof Snow Load (p<sub>s</sub>):</strong>
                            <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">p<sub>s</sub> = C<sub>s</sub> &times; p<sub>f</sub> = ${intermediate.Cs.toFixed(3)} &times; ${intermediate.pf.toFixed(2)} = <b>${intermediate.ps_calculated.toFixed(2)} ${p_unit}</b></div>
                        </li>
                        ${intermediate.is_low_slope ? `<li><strong>ASCE 7 Minimum Check (p<sub>min</sub>):</strong> 
                            <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">
                                p<sub>min</sub> = ${inputs.ground_snow_load > 20 ? `20 * I_s = 20 * ${intermediate.Is.toFixed(2)}` : `p_g * I_s = ${inputs.ground_snow_load.toFixed(2)} * ${intermediate.Is.toFixed(2)}`} = <b>${intermediate.ps_min_asce7.toFixed(2)} ${p_unit}</b>.
                                ${intermediate.asce7_min_governed ? `This minimum governs over the calculated p<sub>s</sub>.` : `The calculated p<sub>s</sub> governs.`}
                            </div></li>` : ''}
                        ${is_nycbc_min_governed ? `<li><strong>Jurisdictional Minimum:</strong> <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">NYCBC minimum of <b>${inputs.nycbc_minimum_roof_snow_load.toFixed(2)} ${p_unit}</b> governs. <span class="ref">[NYCBC, SEC. 1608.4]</span></div></li>` : ''}
                    </ul>
                </div>
            </div>`;

    // --- 3. LOAD CASE DIAGRAMS ---
    html += `<div class="mt-6">
                <h3 class="text-xl font-bold uppercase">3. Load Case Diagrams</h3>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${generateBalancedSnowDiagram()}
                    ${inputs.calculate_unbalanced && unbalanced.applicable ? generateUnbalancedSnowDiagram() : ''}
                    ${inputs.calculate_drift && drift.applicable ? generateDriftSnowDiagram(drift.hd, drift.w, l_unit) : ''}
                </div>
            </div>`;

    // --- 4. FINAL NOMINAL SNOW LOADS ---
    if ((inputs.calculate_unbalanced && unbalanced.applicable) || (inputs.calculate_drift && drift.applicable)) {
        html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 report-section-copyable">
                    ${generateBalancedSnowCard(ps_balanced_nominal, p_unit)}
                 `;

        if (inputs.calculate_unbalanced && unbalanced.applicable) {
            const leeward_total = unbalanced.leeward_nominal + (unbalanced.surcharge_magnitude || 0);
            html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                        <h4 class="text-lg font-semibold text-center mb-3">Governing Unbalanced Snow Load</h4>
                        <div class="flex justify-around text-center">
                            <div><p>Windward</p><p class="font-bold text-2xl">${unbalanced.windward_nominal.toFixed(2)} <span class="text-base font-medium">${p_unit}</span></p></div>
                            <div><p>Leeward</p><p class="font-bold text-2xl">${leeward_total.toFixed(2)} <span class="text-base font-medium">${p_unit}</span></p></div>
                        </div>
                     </div>`;
        } else if (inputs.calculate_unbalanced) {
            html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50"><h4 class="text-lg font-semibold text-center mb-2">Unbalanced Snow Load</h4><p class="text-center text-sm text-gray-500 dark:text-gray-400">Not applicable. ${unbalanced.reason}</p></div>`;
        }

        if (inputs.calculate_drift && drift.applicable) {
            html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                        <h4 class="text-lg font-semibold text-center mb-3">Governing Drift Surcharge Load</h4>
                        <div class="grid grid-cols-3 gap-2 text-center">
                            <div><p>Surcharge (p<sub>d</sub>)</p><p class="font-bold text-xl">${drift.pd_nominal.toFixed(2)} <span class="text-sm font-medium">${p_unit}</span></p></div>
                            <div><p>Drift Height (h<sub>d</sub>)</p><p class="font-bold text-xl">${drift.hd.toFixed(2)} <span class="text-sm font-medium">${l_unit}</span></p></div>
                            <div><p>Drift Width (w)</p><p class="font-bold text-xl">${drift.w.toFixed(2)} <span class="text-sm font-medium">${l_unit}</span></p></div>
                        </div>
                        <div class="text-center mt-3 pt-2 border-t dark:border-gray-600">
                            <p class="text-sm font-semibold">Drift Surcharge Breakdown</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">p<sub>d</sub> = &gamma; &times; h<sub>d</sub> = ${drift.gamma.toFixed(2)} &times; ${drift.hd.toFixed(2)} = ${drift.pd_nominal.toFixed(2)} ${p_unit}</p>
                        </div>
                     </div>`;
        } else if (inputs.calculate_drift) {
            html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50"><h4 class="text-lg font-semibold text-center mb-2">Drift Surcharge Load</h4><p class="text-center text-sm text-gray-500 dark:text-gray-400">Not applicable. ${drift.reason}</p></div>`;
        }

        if (inputs.calculate_sliding) {
            html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                        <h3 class="text-lg font-semibold text-center mb-2">Governing Sliding Snow Load (ASCE 7 Sec. 7.13)</h3>`;
            if (sliding.applicable) {
                html += `<div class="grid grid-cols-2 text-center">
                            <div><p>Sliding Load Intensity (p<sub>s,slide</sub>)</p><p class="font-bold text-2xl">${sliding.ps_sliding.toFixed(2)} ${p_unit}</p></div>
                            <div><p>Total Sliding Force (W<sub>s</sub>)</p><p class="font-bold text-2xl">${sliding.Ws.toFixed(2)} ${f_unit}</p></div>
                         </div>
                         <p class="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">This load is added to the balanced snow on the lower roof, distributed over a width of ${sliding.distribution_width.toFixed(1)} ${l_unit}.</p>`;
            } else {
                html += `<p class="text-center text-gray-600 dark:text-gray-400">${sliding.reason}</p>`;
            }
            html += `</div>`;
        }

        html += `</div>`;
    }

    if (results.partial && results.partial.applicable) {
        const { partial } = results;
        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-6 report-section-copyable">
                    <h3 class="text-lg font-semibold text-center mb-2">Partial Loading (ASCE 7 Sec. 7.8)</h3>
                    <div class="text-center">
                        <p>Load on Adjacent Span</p>
                        <p class="font-bold text-2xl">${partial.load_on_adjacent_span.toFixed(2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">${partial.note}</p>
                    </div>
                 </div>`;
    }

    html += `</div>`;
    resultsContainer.innerHTML = html;
}

function generateBalancedSnowCard(load, unit) {
    return `
        <div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 text-center">
            <h4 class="text-lg font-semibold mb-3">Governing Balanced Snow Load</h4>
            <p class="font-bold text-3xl">${load.toFixed(2)} <span class="text-xl font-medium">${unit}</span></p>
        </div>`
}

function generateBalancedSnowDiagram() {
    return `
        <div class="diagram">
            <h4 class="text-center font-semibold text-sm mb-2">Balanced Snow Load</h4>
            <svg viewBox="0 0 200 150" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 130 L 20 90 L 100 50 L 180 90 L 180 130 Z" class="svg-member" />
                <polygon points="20,88 100,48 180,88 180,78 100,38 20,78" fill="#dbeafe" opacity="0.8" stroke="#60a5fa" stroke-width="0.5" />
                <text x="100" y="70" class="svg-label" text-anchor="middle">p_s</text>
                <line x1="10" y1="130" x2="190" y2="130" class="svg-dim" stroke-dasharray="2 2" />
            </svg>
            <p class="text-xs text-center mt-2">Uniform load over the entire roof surface.</p>
        </div>`;
}

function generateUnbalancedSnowDiagram() {
    return `
        <div class="diagram">
            <h4 class="text-center font-semibold text-sm mb-2">Unbalanced Snow Load</h4>
            <svg viewBox="0 0 200 150" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                <!-- Building -->
                <path d="M20 130 L 20 90 L 100 50 L 180 90 L 180 130 Z" class="svg-member" />
                <!-- Wind Arrow -->
                <path d="M10 70 L 40 70" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)" />
                <text x="15" y="65" class="svg-dim-text">Wind</text>
                <!-- Leeward Snow -->
                <polygon points="100,50 180,90 180,60 100,20" fill="#dbeafe" opacity="0.8" stroke="#60a5fa" stroke-width="0.5" />
                <text x="140" y="55" class="svg-label" text-anchor="middle">Leeward</text>
                <!-- Windward Snow (or lack thereof) -->
                <text x="60" y="75" class="svg-label" text-anchor="middle">Windward</text>
                <!-- Ground -->
                <line x1="10" y1="130" x2="190" y2="130" class="svg-dim" stroke-dasharray="2 2" />
            </svg>
            <p class="text-xs text-center mt-2">Wind removes snow from the windward side and deposits it on the leeward side.</p>
        </div>`;
}

function generateDriftSnowDiagram(hd, w, l_unit) {
    return `
        <div class="diagram">
            <h4 class="text-center font-semibold text-sm mb-2">Drift Surcharge Load</h4>
            <svg viewBox="0 0 200 150" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                <!-- High Roof -->
                <rect x="20" y="50" width="80" height="80" class="svg-member" />
                <!-- Low Roof -->
                <rect x="100" y="90" width="80" height="40" class="svg-member" />
                <!-- Drift -->
                <path d="M100 90 L 100 60 L ${100 + (w/hd * 30)} 90 Z" fill="#dbeafe" opacity="0.8" stroke="#60a5fa" stroke-width="0.5" />
                <text x="125" y="80" class="svg-label" text-anchor="middle">Drift (p_d)</text>
                <!-- Ground -->
                <line x1="10" y1="130" x2="190" y2="130" class="svg-dim" stroke-dasharray="2 2" />
            </svg>
            <p class="text-xs text-center mt-2">Snow accumulates against a taller adjacent structure, creating a drift surcharge.</p>
        </div>`;
}