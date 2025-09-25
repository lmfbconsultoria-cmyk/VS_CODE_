let lastSnowRunResults = null;

/**
 * Wraps a calculation function in a try-catch block to prevent crashes.
 * @param {function} calcFunction - The function to execute.
 * @param {string} errorMessage - A user-friendly error message.
 * @returns The result of the function or an error object.
 */
function safeCalculation(calcFunction, errorMessage) {
    try {
        return calcFunction();
    } catch (error) {
        console.error(errorMessage, error);
        return { error: errorMessage, success: false };
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function setLoadingState(isLoading) {
    const button = document.getElementById(`run-snow-calculation-btn`);
    if (!button) return;

    if (isLoading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
        }
        button.disabled = true;
        button.innerHTML = `<span class="flex items-center justify-center"><svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Calculating...</span>`;
    } else {
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
        }
        button.disabled = false;
    }
}

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
        document.getElementById('run-snow-calculation-btn').addEventListener('click', handleRunSnowCalculation);
        document.getElementById('save-snow-inputs-btn').addEventListener('click', handleSaveSnowInputs);
        document.getElementById('load-snow-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('snow-file-input'));
        document.getElementById('snow-file-input').addEventListener('change', handleLoadSnowInputs);

        attachDebouncedListeners(snowInputIds, handleRunSnowCalculation);

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        document.body.addEventListener('click', (event) => {
            if (event.target.id === 'copy-report-btn') {
                handleCopyToClipboard('snow-results-container', 'feedback-message');
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

function validateInputs(inputs, type) {
    const rules = validationRules[type];
    const errors = [];
    const warnings = [];

    if (rules) {
        for (const [key, rule] of Object.entries(rules)) {
            const value = inputs[key];
            const label = rule.label || key;

            if (rule.required && (value === undefined || value === '' || (typeof value === 'number' && isNaN(value)))) {
                errors.push(`${label} is required.`);
                continue;
            }
            if (typeof value === 'number') {
                if (rule.min !== undefined && value < rule.min) errors.push(`${label} must be at least ${rule.min}.`);
                if (rule.max !== undefined && value > rule.max) errors.push(`${label} must be no more than ${rule.max}.`);
            }
        }
    }
    return { errors, warnings };
}

function renderValidationResults(validation, container) {
    let html = '';
    if (validation.errors && validation.errors.length > 0) {
        html += `<div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md my-4">
                    <p class="font-bold">Input Errors Found:</p>
                    <ul class="list-disc list-inside mt-2">${validation.errors.map(e => `<li>${e}</li>`).join('')}</ul>
                    <p class="mt-2">Please correct the errors and run the check again.</p>
                 </div>`;
    }
    if (validation.warnings && validation.warnings.length > 0) {
        html += `<div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-md my-4">
                    <p class="font-bold">Warnings:</p>
                    <ul class="list-disc list-inside mt-2">${validation.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
                 </div>`;
    }
    if (container) {
        container.innerHTML = html;
    }
    return html;
}

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

function run(inputs) {
         const { Is, Ce, Ct } = getSnowFactors(inputs.risk_category, inputs.exposure_condition, inputs.thermal_condition, inputs.surface_roughness_category);
         const Cs = calculateSlopeFactor(inputs.roof_slope_degrees, inputs.is_roof_slippery, Ct, inputs.asce_standard);
         const pf = 0.7 * Ce * Ct * Is * inputs.ground_snow_load;
         let ps_calculated = Cs * pf;
         
         let ps_min_asce7 = 0;
         const is_low_slope = inputs.roof_slope_degrees < 15;
         if (is_low_slope) {
            ps_min_asce7 = Math.min(inputs.ground_snow_load, 20) * Is;
         }
         
         let ps_asce7 = is_low_slope ? Math.max(ps_calculated, ps_min_asce7) : ps_calculated;
         
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
            intermediate: { Is, Ce, Ct, Cs, pf, ps_asce7, is_low_slope, asce7_min_governed: ps_asce7 > ps_calculated, ps_calculated },
            results: { ps_balanced_nominal: ps_balanced },
            unbalanced: unbalanced_results, drift: drift_results, partial: partial_load_results, sliding: sliding_snow_results,
            is_nycbc_min_governed,
            success: true
        };
    }

    return { run };
})();

function handleRunSnowCalculation() {
    const rawInputs = gatherInputsFromIds(snowInputIds);
    const inputs = {
        // Sanitize all numerical inputs to prevent NaN issues
        ground_snow_load: Math.max(0, rawInputs.snow_ground_snow_load),
        nycbc_minimum_roof_snow_load: Math.max(0, rawInputs.snow_nycbc_minimum_roof_snow_load),
        roof_slope_degrees: Math.max(0, Math.min(90, rawInputs.snow_roof_slope_degrees)),
        eave_to_ridge_distance_W: Math.max(0, rawInputs.snow_eave_to_ridge_distance_W),
        winter_wind_parameter_W2: Math.max(0, rawInputs.snow_winter_wind_parameter_W2),
        upper_roof_length_lu: Math.max(0, rawInputs.snow_upper_roof_length_lu),
        height_difference_hc: Math.max(0, rawInputs.snow_height_difference_hc),
        lower_roof_length_ll: Math.max(0, rawInputs.snow_lower_roof_length_ll),
    };

    for (const id in rawInputs) {
        const key = id.replace('snow_', '');
        const value = rawInputs[id];
        if (['is_roof_slippery', 'is_simply_supported_prismatic', 'calculate_unbalanced', 'calculate_drift', 'calculate_sliding'].includes(key)) {
            inputs[key] = value === 'Yes';
        } else if (inputs[key] === undefined) { // Add non-numeric inputs
            inputs[key] = value;
        }
    }
    
    const validation = validateInputs(inputs, 'snow');
    if (validation.errors.length > 0) {
        renderValidationResults(validation, document.getElementById('snow-results-container'));
        return;
    }

    setLoadingState(true);
    const results = safeCalculation(
        () => snowLoadCalculator.run(inputs, validation),
        'An unexpected error occurred during the snow calculation.'
    );
    if (results.error) {
        setLoadingState(false);
        renderValidationResults({ errors: [results.error] }, document.getElementById('snow-results-container'));
        return;
    }
    renderSnowResults(results);
    setLoadingState(false);
}

function renderSnowResults(results) {
     if (!results || !results.success) return;
     lastSnowRunResults = results;

     const resultsContainer = document.getElementById('snow-results-container');
     const { inputs, intermediate, is_nycbc_min_governed, unbalanced, drift, sliding, warnings } = results;
     const { ps_balanced_nominal } = results.results;
     const p_unit = inputs.unit_system === 'imperial' ? 'psf' : 'kPa';
     const l_unit = inputs.unit_system === 'imperial' ? 'ft' : 'm';

     let html = `<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
     html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2">
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

    html += `
        <div class="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
            <h3 class="text-xl font-semibold text-center mb-4">Balanced Snow Load (${inputs.design_method})</h3>
            <div class="text-center">
                <p class="text-4xl font-bold">${ps_balanced_nominal.toFixed(2)} <span class="text-2xl font-medium">${p_unit}</span></p>
            </div>
            <div class="text-center mt-4">
                <button data-toggle-id="snow-balanced-details" class="toggle-details-btn text-base">[Show Calculation]</button>
            </div>
            <div id="snow-balanced-details" class="details-row is-visible">
                <div class="calc-breakdown mt-4">
                    <h4>Balanced Snow Load Breakdown</h4>
                    <ul>
                        <li>Flat Roof Snow Load (p<sub>f</sub>) = 0.7 * C<sub>e</sub> * C<sub>t</sub> * I<sub>s</sub> * p<sub>g</sub></li>
                        <li>p<sub>f</sub> = 0.7 * ${intermediate.Ce.toFixed(2)} * ${intermediate.Ct.toFixed(2)} * ${intermediate.Is.toFixed(2)} * ${inputs.ground_snow_load} = <b>${intermediate.pf.toFixed(2)} ${p_unit}</b></li>
                        <li>Slope Factor (C<sub>s</sub>) = <b>${intermediate.Cs.toFixed(3)}</b> (for ${inputs.roof_slope_degrees}° slope)</li>
                        <li>Calculated Roof Snow Load (p<sub>s</sub>) = p<sub>f</sub> * C<sub>s</sub> = ${intermediate.pf.toFixed(2)} * ${intermediate.Cs.toFixed(3)} = <b>${intermediate.ps_calculated.toFixed(2)} ${p_unit}</b></li>
                        ${intermediate.asce7_min_governed ? `<li>Minimum Snow Load (p<sub>min</sub>) for low-slope roofs governs: <b>${intermediate.ps_asce7.toFixed(2)} ${p_unit}</b></li>` : ''}
                    </ul>
                </div>
            </div>
        </div>`;

    if (inputs.calculate_unbalanced) {
         html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                    <h3 class="text-xl font-semibold text-center mb-4">Unbalanced Snow Load</h3>`;
        if (unbalanced.applicable) {
            const leeward_total = unbalanced.leeward_nominal + (unbalanced.surcharge_magnitude || 0);
            html += `<div class="grid grid-cols-2 text-center">
                        <div><p>Windward</p><p class="font-bold text-2xl">${unbalanced.windward_nominal.toFixed(2)} ${p_unit}</p></div>
                        <div><p>Leeward</p><p class="font-bold text-2xl">${leeward_total.toFixed(2)} ${p_unit}</p></div>
                     </div>`;
            if (unbalanced.surcharge_magnitude) {
                html += `<div class="text-center mt-4">
                            <button data-toggle-id="snow-unbalanced-details" class="toggle-details-btn text-base">[Show Calculation]</button>
                         </div>
                         <div id="snow-unbalanced-details" class="details-row">
                            <div class="calc-breakdown mt-4">
                                <h4>Unbalanced Surcharge Breakdown</h4>
                                <ul>
                                    <li>Surcharge Load = &gamma; * h<sub>d</sub> / &radic;S = ${unbalanced.S_val > 0 ? `${unbalanced.hd_unbalanced.toFixed(2)} * ${calculateSnowDensity(inputs.ground_snow_load).toFixed(2)} / &radic;${unbalanced.S_val.toFixed(2)}` : 'N/A'} = <b>${unbalanced.surcharge_magnitude.toFixed(2)} ${p_unit}</b></li>
                                </ul>
                            </div></div>`;
            }
        } else {
             html += `<p class="text-center text-gray-600 dark:text-gray-400">${unbalanced.reason}</p>`;
        }
         html += `</div>`;
    }

    if (inputs.calculate_drift) {
         html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                    <h3 class="text-xl font-semibold text-center mb-4">Drift Surcharge Load</h3>`;
         if (drift.applicable) {
              html += `<div class="grid grid-cols-3 text-center">
                        <div><p>Surcharge (p<sub>d</sub>)</p><p class="font-bold text-2xl">${drift.pd_nominal.toFixed(2)} ${p_unit}</p></div>
                        <div><p>Drift Height (h<sub>d</sub>)</p><p class="font-bold text-2xl">${drift.hd.toFixed(2)} ${l_unit}</p></div>
                        <div><p>Drift Width (w)</p><p class="font-bold text-2xl">${drift.w.toFixed(2)} ${l_unit}</p></div>
                     </div>`;
            html += `<div class="text-center mt-4">
                        <button data-toggle-id="snow-drift-details" class="toggle-details-btn text-base">[Show Calculation]</button>
                     </div>
                     <div id="snow-drift-details" class="details-row">
                        <div class="calc-breakdown mt-4">
                            <h4>Drift Surcharge Breakdown</h4>
                            <ul>
                                <li>Drift Surcharge (p<sub>d</sub>) = &gamma; * h<sub>d</sub> = ${drift.gamma.toFixed(2)} * ${drift.hd.toFixed(2)} = <b>${drift.pd_nominal.toFixed(2)} ${p_unit}</b></li>
                            </ul>
                        </div></div>`;
         } else {
             html += `<p class="text-center text-gray-600 dark:text-gray-400">${drift.reason}</p>`;
         }
         html += `</div>`;
    }

    if (results.partial && results.partial.applicable) {
        const { partial } = results;
        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                    <h3 class="text-xl font-semibold text-center mb-4">Partial Loading (ASCE 7 Sec. 7.8)</h3>
                    <div class="text-center">
                        <p>Load on Adjacent Span</p>
                        <p class="font-bold text-2xl">${partial.load_on_adjacent_span.toFixed(2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">${partial.note}</p>
                    </div>
                 </div>`;
    }

    if (inputs.calculate_sliding) {
        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                    <h3 class="text-xl font-semibold text-center mb-4">Sliding Snow Load (ASCE 7 Sec. 7.13)</h3>`;
        if (sliding.applicable) {
            const f_unit = inputs.unit_system === 'imperial' ? 'plf' : 'kN/m';
            html += `<div class="grid grid-cols-2 text-center">
                        <div><p>Sliding Load Intensity (p<sub>s,slide</sub>)</p><p class="font-bold text-2xl">${sliding.ps_sliding.toFixed(2)} ${p_unit}</p></div>
                        <div><p>Total Sliding Force (W<sub>s</sub>)</p><p class="font-bold text-2xl">${sliding.Ws.toFixed(2)} ${f_unit}</p></div>
                     </div>
                     <p class="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">This load is added to the balanced snow on the lower roof, distributed over ${sliding.distribution_width.toFixed(1)} ${l_unit}.</p>`;
        } else {
            html += `<p class="text-center text-gray-600 dark:text-gray-400">${sliding.reason}</p>`;
        }
        html += `</div>`;
    }

    html += `</div>`;
    resultsContainer.innerHTML = html;
}

function handleSaveSnowInputs() {
    const inputs = gatherInputsFromIds(snowInputIds);
    saveInputsToFile(inputs, 'snow-inputs.txt');
    showFeedback('Snow inputs saved to snow-inputs.txt', false, 'feedback-message');
}

function handleLoadSnowInputs(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const inputs = JSON.parse(e.target.result);
            snowInputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && inputs[id] !== undefined) {
                    if (el.type === 'checkbox') el.checked = inputs[id];
                    else el.value = inputs[id];
                }
            });
            showFeedback('Snow inputs loaded successfully!', false, 'feedback-message');
            handleRunSnowCalculation();
        } catch (err) {
            showFeedback('Failed to load snow inputs. Data may be corrupt.', true, 'feedback-message');
            console.error("Error parsing saved data:", err);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}