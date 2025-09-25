// --- GLOBAL VARIABLES for state management ---
let lastWindRunResults = null;

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
    const button = document.getElementById(`run-calculation-btn`);
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

function addRangeIndicators() {
    document.querySelectorAll('input[type="number"][min], input[type="number"][max]').forEach(input => {
        const min = input.min ? `Min: ${input.min}` : '';
        const max = input.max ? `Max: ${input.max}` : '';
        const hint = `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${[min, max].filter(Boolean).join(' | ')}</div>`;
        input.insertAdjacentHTML('afterend', hint);
    });
}

const windInputIds = [
    'asce_standard', 'unit_system', 'risk_category', 'design_method',
    'jurisdiction', 'ground_elevation', 'topographic_factor_Kzt',
    'basic_wind_speed', 'exposure_category', 'mean_roof_height', 'building_flexibility',
    'fundamental_period',
    'building_length_L', 'building_width_B', 'enclosure_classification',
    'roof_type', 'roof_slope_deg', 'structure_type_for_kd',
    'gust_effect_factor_g', 'temporary_construction', 'wind_obstruction', 'effective_wind_area'
];

// =================================================================================
//  UI INJECTION & INITIALIZATION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
    
    function initializeApp() {
        attachEventListeners();
        addRangeIndicators();
    }

    // --- EVENT HANDLERS ---
    function attachEventListeners() {
        function attachDebouncedListeners(ids, handler) {
            const debouncedHandler = debounce(handler, 500);
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    // 'input' for text/number, 'change' for select/checkbox
                    el.addEventListener('input', debouncedHandler);
                    el.addEventListener('change', debouncedHandler);
                }
            });
        }

        initializeTheme(); // Set initial theme state
        document.getElementById('run-calculation-btn').addEventListener('click', handleRunWindCalculation);
        document.getElementById('save-inputs-btn').addEventListener('click', () => handleSaveWindInputs());
        document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('wind-file-input'));
        document.getElementById('wind-file-input').addEventListener('change', (e) => handleLoadWindInputs(e));

        attachDebouncedListeners(windInputIds, handleRunWindCalculation);

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        document.getElementById('enclosure_classification').addEventListener('change', (event) => {
            const isOpen = event.target.value === 'Open';
            document.getElementById('open-building-options').classList.toggle('hidden', !isOpen);
        });
        document.getElementById('enclosure_classification').dispatchEvent(new Event('change'));

        document.getElementById('mean_roof_height').addEventListener('input', (event) => {
            const h = parseFloat(event.target.value) || 0;
            const is_imp = document.getElementById('unit_system').value === 'imperial';
            const limit = is_imp ? 60 : 18.3;
            document.getElementById('tall-building-section').classList.toggle('hidden', h <= limit);
        });
        document.getElementById('mean_roof_height').dispatchEvent(new Event('input'));

        document.getElementById('building_flexibility').addEventListener('change', (event) => {
            const isFlexible = event.target.value === 'Flexible';
            document.getElementById('flexible-building-inputs').classList.toggle('hidden', !isFlexible);
        });
        document.getElementById('building_flexibility').dispatchEvent(new Event('change'));


        document.body.addEventListener('click', (event) => {
            if (event.target.id === 'copy-report-btn') {
                handleCopyToClipboard('results-container', 'feedback-message');
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
    
}); // END DOMContentLoaded

// =================================================================================
//  WIND LOAD CALCULATOR LOGIC
// =================================================================================
const windLoadCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
// Linear interpolation for normative tables
// Reference: ASCE 7-16/22, used in several tables (e.g., Table 26.9-1, 26.10-1)
function interpolate(x, xp, fp) {
        if (x <= xp[0]) return fp[0];
        if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
        let i = 0;
        while (x > xp[i + 1]) i++;
        const x1 = xp[i], y1 = fp[i];
        const x2 = xp[i + 1], y2 = fp[i + 1];
        return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
    }

// Internal pressure coefficient GCpi
// Reference: ASCE 7-16/22 Table 26.13-1
function getInternalPressureCoefficient(enclosureClass) {
        const map = {
            "Enclosed": [0.18, "ASCE 7 Table 26.13-1 (Enclosed)"],
            "Partially Enclosed": [0.55, "ASCE 7 Table 26.13-1 (Partially Enclosed)"],
            "Open": [0.00, "ASCE 7 Table 26.13-1 (Open)"]
        };
        return map[enclosureClass] || [0.00, "Invalid Enclosure"];
    }

    // Detailed Cp values for Gable and Hip roofs
    // Reference: ASCE 7-16/22 Figure 27.3-2
    function getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem) {
        const cpMap = {};
        const theta = roofSlopeDeg;
        const h_over_L = L > 0 ? h / L : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        // Calculate 'a' per ASCE 7-16/22 Section 27.3.2
        const least_dim = Math.min(L, B);
        let a = Math.min(0.1 * least_dim, 0.4 * h);
        const min_a_val1 = 0.04 * least_dim;
        const min_a_val2 = unitSystem === 'imperial' ? 3.0 : 0.9;
        a = Math.max(a, min_a_val1, min_a_val2);

        const a_str = `(a=${a.toFixed(1)} ${h_unit})`;

        // Interpolation functions for Cp based on theta and h/L
        // Windward zones (1, 2, 3)
        const cp_1_windward = interpolate(theta, [10, 20, 30, 45], [-0.7, -0.4, 0.2, 0.4]);
        const cp_2_windward = interpolate(theta, [10, 20, 30, 45], [-0.9, -0.7, -0.2, 0.4]);
        const cp_3_windward = interpolate(theta, [20, 30, 45], [-1.3, -1.0, -0.5]);

        // Leeward zones (1, 2, 3)
        const cp_1_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.5, -0.5, -0.3]);
        const cp_2_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.7, -0.7, -0.5]);
        const cp_3_leeward = -0.9;

        // Assign values to the map
        cpMap[`Roof Zone 1 (Windward)`] = cp_1_windward;
        cpMap[`Roof Zone 2 (Windward) ${a_str}`] = cp_2_windward;
        if (theta >= 20) {
            cpMap[`Roof Zone 3 (Windward) ${a_str}`] = cp_3_windward;
        }

        cpMap[`Roof Zone 1 (Leeward)`] = cp_1_leeward;
        cpMap[`Roof Zone 2 (Leeward) ${a_str}`] = cp_2_leeward;
        cpMap[`Roof Zone 3 (Leeward) ${a_str}`] = cp_3_leeward;

        if (isHip) {
            // Hip roof end zones (1E, 2E, 3E)
            const cp_1E = interpolate(theta, [10, 20, 27], [-0.9, -0.7, -0.5]);
            const cp_2E = interpolate(theta, [10, 20, 27], [-1.3, -0.9, -0.7]);
            const cp_3E = interpolate(theta, [20, 27], [-1.3, -1.0]);

            cpMap[`Hip End Zone 1E`] = cp_1E;
            cpMap[`Hip End Zone 2E ${a_str}`] = cp_2E;
            if (theta >= 20) {
                cpMap[`Hip End Zone 3E ${a_str}`] = cp_3E;
            }
        }

        // Side walls are always -0.7
        cpMap["Side Wall"] = -0.7;

        return cpMap;
    }

    // Cp values for buildings of all heights (Analytical Procedure)
    // Reference: ASCE 7-16 Figure 27.3-1
    function getAnalyticalCpValues(h, L, B, roofType, roofSlopeDeg) {
        const cpMap = {};
        const refNotes = {};
        const L_over_B = B > 0 ? L / B : 0;

        // Walls
        cpMap["Windward Wall"] = 0.8;
        refNotes["Windward Wall"] = "ASCE 7 Fig. 27.3-1 (All Heights)";
        cpMap["Side Wall"] = -0.7;
        refNotes["Side Wall"] = "ASCE 7 Fig. 27.3-1 (All Heights)";
        cpMap["Leeward Wall"] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
        refNotes["Leeward Wall"] = "ASCE 7 Fig. 27.3-1 (varies with L/B)";

        // Roof
        const h_over_L = L > 0 ? h / L : 0;
        const theta = roofSlopeDeg;

        if (h_over_L <= 0.8) {
            cpMap["Roof Windward"] = interpolate(theta, [10, 15, 20, 25, 30, 35, 45], [-0.7, -0.5, -0.3, -0.2, 0.0, 0.2, 0.4]);
            cpMap["Roof Leeward"] = interpolate(theta, [10, 15, 20], [-0.3, -0.5, -0.6]);
        } else { // h/L > 0.8
            cpMap["Roof Windward"] = interpolate(theta, [10, 15, 20, 25, 30, 35, 45], [-0.9, -0.7, -0.4, -0.3, -0.2, 0.0, 0.4]);
            cpMap["Roof Leeward"] = -0.7;
        }
        refNotes["Roof"] = "ASCE 7 Fig. 27.3-1 (h/L & slope dependent)";
        return { cpMap, refNotes };
    }

    // Net pressure coefficients CN for Open Buildings with Free Roofs
    // Reference: ASCE 7-16/22 Figure 27.3-4
    function getOpenBuildingCnValues(roofSlopeDeg, isObstructed) {
        const cnMap = {};
        const theta = Math.abs(roofSlopeDeg); // Use absolute slope
        const caseKey = isObstructed ? 'obstructed' : 'unobstructed';

        // Net Pressure Coefficients, CN, for Monoslope Roofs
        const monoslope_map = {
            unobstructed: {
                zones: ['Zone 2', 'Zone 3'],
                windward_qtr: [interpolate(theta, [5, 30, 45], [0.8, 1.2, 1.2]), interpolate(theta, [5, 30, 45], [1.2, 1.8, 1.8])],
                middle_half:  [interpolate(theta, [5, 30, 45], [-0.8, -0.8, -0.8]), interpolate(theta, [5, 30, 45], [-1.2, -1.2, -1.2])],
                leeward_qtr:  [interpolate(theta, [5, 30, 45], [-0.6, -0.5, -0.5]), interpolate(theta, [5, 30, 45], [-1.0, -0.8, -0.8])]
            },
            obstructed: {
                zones: ['Zone 2', 'Zone 3'],
                windward_qtr: [interpolate(theta, [5, 30, 45], [1.6, 2.4, 2.4]), interpolate(theta, [5, 30, 45], [2.2, 3.3, 3.3])],
                middle_half:  [interpolate(theta, [5, 30, 45], [-1.6, -1.6, -1.6]), interpolate(theta, [5, 30, 45], [-2.2, -2.2, -2.2])],
                leeward_qtr:  [interpolate(theta, [5, 30, 45], [-1.2, -1.0, -1.0]), interpolate(theta, [5, 30, 45], [-1.6, -1.4, -1.4])]
            }
        };

        // For pitched/troughed, we use the monoslope values for each half
        const data = monoslope_map[caseKey];
        cnMap[`Windward Roof (First Quarter)`] = { cn_pos: data.windward_qtr[0], cn_neg: -data.windward_qtr[0] };
        cnMap[`Windward Roof (Zone 3)`] = { cn_pos: data.windward_qtr[1], cn_neg: -data.windward_qtr[1] };
        cnMap[`Middle Roof Area (Half)`] = { cn_pos: data.middle_half[0], cn_neg: -data.middle_half[0] };
        cnMap[`Middle Roof Area (Zone 3)`] = { cn_pos: data.middle_half[1], cn_neg: -data.middle_half[1] };
        cnMap[`Leeward Roof (Last Quarter)`] = { cn_pos: data.leeward_qtr[0], cn_neg: -data.leeward_qtr[0] };
        cnMap[`Leeward Roof (Zone 3)`] = { cn_pos: data.leeward_qtr[1], cn_neg: -data.leeward_qtr[1] };

        return { cnMap, ref: `ASCE 7 Fig 27.3-4 (${caseKey} flow)` };
    }

    // External pressure coefficients Cp
    // Reference: ASCE 7-16/22 Figures 27.4-1, 27.4-2, 27.4-3 (now includes edge/corner zones for flat roofs)
    // NOTE: For more complex roof shapes, see future improvement
    function getCpValues(standard, h, L, B, roofType, roofSlopeDeg, unitSystem) {
        const cpMap = {};
        const refNotes = {};
        const L_over_B = B > 0 ? L / B : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        cpMap["Windward Wall"] = 0.8;
        refNotes["Windward Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Side Wall"] = -0.7;
        refNotes["Side Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Leeward Wall"] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
        refNotes["Leeward Wall"] = "ASCE 7 Fig. 27.4-1 (varies with L/B)";

        if (roofType === "flat") {
            if (standard === "ASCE 7-22") {
                // ASCE 7-22 Figure 27.4-1 (Zoned approach)
                let a = Math.min(0.1 * Math.min(L, B), 0.4 * h);
                const min_a = unitSystem === 'imperial' ? 3.0 : 0.9;
                a = Math.max(a, min_a);
                cpMap[`Roof Zone 1 (0 to ${a.toFixed(1)} ${h_unit})`] = -0.9;
                cpMap[`Roof Zone 2 (${a.toFixed(1)} to ${2*a.toFixed(1)} ${h_unit})`] = -0.5;
                cpMap[`Roof Zone 3 (> ${2*a.toFixed(1)} ${h_unit})`] = -0.3;
                refNotes["Roof"] = "ASCE 7-22 Fig. 27.4-1 (Zoned approach)";
            } else { // ASCE 7-16
                // ASCE 7-16 Figure 27.4-1 (h/L approach)
                const h_over_L = L > 0 ? h / L : 0;
                if (h_over_L <= 0.5) {
                    cpMap[`Roof (0 to ${(h/2).toFixed(1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${(h/2).toFixed(1)} to ${h.toFixed(1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${h.toFixed(1)} to ${(2*h).toFixed(1)} ${h_unit})`] = -0.5;
                    cpMap[`Roof (> ${(2*h).toFixed(1)} ${h_unit})`] = -0.3;
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L ≤ 0.5)";
                } else {
                    cpMap[`Roof (0 to ${(h/2).toFixed(1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -1.3]);
                    cpMap[`Roof (${(h/2).toFixed(1)} to ${h.toFixed(1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -0.7]);
                    cpMap[`Roof (> ${h.toFixed(1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.5, -0.4]);
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L > 0.5)";
                }
            }
        } else if (["gable", "hip"].includes(roofType)) {
            const isHip = roofType === 'hip';
            const gableHipCp = getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem);
            Object.assign(cpMap, gableHipCp);
            refNotes["Roof"] = `ASCE 7-16/22 Fig. 27.4-2 (${isHip ? 'Hip' : 'Gable'})`;
        }
        return { cpMap, refNotes };
    }

// Directionality factor Kd
// Reference: ASCE 7-16/22 Table 26.6-1
function getKdFactor(structureType) {
        const kdMap = {
            "Buildings (MWFRS, C&C)": [0.85, "ASCE 7 Table 26.6-1 (Buildings)"],
            "Arched Roofs": [0.85, "ASCE 7 Table 26.6-1 (Arched Roofs)"],
            "Solid Freestanding Signs/Walls": [0.85, "ASCE 7 Table 26.6-1 (Signs/Walls)"],
            "Open Signs/Frames": [0.85, "ASCE 7 Table 26.6-1 (Open Signs)"],
            "Trussed Towers (Triangular, Square, Rectangular)": [0.85, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Trussed Towers (All Other Cross Sections)": [0.95, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Chimneys, Tanks (Square)": [0.90, "ASCE 7 Table 26.6-1 (Square)"],
            "Chimneys, Tanks (Hexagonal)": [0.95, "ASCE 7 Table 26.6-1 (Hexagonal)"]
        };
        return kdMap[structureType] || [1.0, "ASCE 7 Table 26.6-1 (Default)"];
    }

// Importance factor Iw
// Reference: ASCE 7-16/22 Table 1.5-2
function getImportanceFactor(category, standard) {
        const factors = standard === "ASCE 7-22" ? { "I": 0.75, "II": 1.00, "III": 1.15, "IV": 1.15 } : { "I": 0.87, "II": 1.00, "III": 1.15, "IV": 1.15 };
        const ref = standard === "ASCE 7-22" ? "ASCE 7-22 Table 1.5-2" : "ASCE 7-16 Table 1.5-2";
        return [factors[category] || 1.00, ref];
    }

// Wind exposure constants (alpha, zg)
// Reference: ASCE 7-16/22 Table 26.9-1
function getExposureConstants(category, units) {
    const expMap = {
        'B': { alpha: 7.0, zg_imp: 1200.0, zg_metric: 365.8, ref: "ASCE 7 Table 26.9-1 (Exposure B)" },
        'C': { alpha: 9.5, zg_imp: 900.0, zg_metric: 274.3, ref: "ASCE 7 Table 26.9-1 (Exposure C)" },
        'D': { alpha: 11.5, zg_imp: 700.0, zg_metric: 213.4, ref: "ASCE 7 Table 26.9-1 (Exposure D)" }
    };
    const data = expMap[category] || expMap['C'];
    const zg = units === 'imperial' ? data.zg_imp : data.zg_metric;
    return { alpha: data.alpha, zg, ref_note: data.ref };
}

// Calculation of exposure factor Kz
// Reference: ASCE 7-16/22 Section 26.10, Eq. 26.10-1
// Table 26.10-1 for exposure constants
function calculateKz(h, category, units) { // Refactored for readability
    // --- 1. Input Validation (Guard Clauses) ---
    if (!isFinite(h) || h < 0 || !category) {
        console.error("Invalid parameters for calculateKz:", { h, category });
        return { Kz: 1.0, alpha: 0, zg: 0, ref_note: "Error: Invalid input" };
    }

    const { alpha, zg, ref_note } = getExposureConstants(category, units);
    if (!isFinite(alpha) || !isFinite(zg) || alpha <= 0 || zg <= 0) {
        console.error("Invalid exposure constants from getExposureConstants:", { alpha, zg });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Invalid exposure constants" };
    }

    // --- 2. Main Calculation Logic ---
    const min_h = units === 'imperial' ? 15.0 : 4.6;
    const calc_h = Math.max(h, min_h);
    const Kz = 2.01 * Math.pow(calc_h / zg, 2 / alpha);

    // --- 3. Output Validation ---
    if (!isFinite(Kz)) {
        console.error("Kz calculation resulted in a non-finite value:", { calc_h, zg, alpha });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Kz calculation failed" };
    }

    return { Kz, alpha, zg, ref_note };
}

// Elevation factor Ke
// Reference: ASCE 7-16 Table 26.9-1; ASCE 7-22 Section 26.9 (Ke=1.0)
function calculateKe(elevation, units, standard) {
        if (standard === "ASCE 7-22") return [1.0, "ASCE 7-22 Section 26.9 (Ke = 1.0)"];
        const elev_ft = [-500, 0, 500, 1000, 2000, 3000, 4000, 5000, 6000];
        const ke_vals = [1.05, 1.00, 0.95, 0.90, 0.82, 0.74, 0.67, 0.61, 0.55];
        const elev_calc = units === 'metric' ? elevation * 3.28084 : elevation;
        const ke_val = interpolate(elev_calc, elev_ft, ke_vals);
        return [ke_val, `ASCE 7-16 Table 26.9-1 (Elevation: ${elev_calc.toFixed(0)} ft)`];
    }

// Wind velocity pressure qz
// Reference: ASCE 7-16/22 Eq. 26.10-1
function calculateVelocityPressure(Kz, Kzt, Kd, Ke, V, standard, riskCat, units) {
    // Validate all inputs
    const safeKz = isFinite(Kz) && Kz > 0 ? Kz : 1.0;
    const safeKzt = isFinite(Kzt) && Kzt > 0 ? Kzt : 1.0;
    const safeKd = isFinite(Kd) && Kd > 0 ? Kd : 0.85;
    const safeKe = isFinite(Ke) && Ke > 0 ? Ke : 1.0;
    const safeV = isFinite(V) && V > 0 ? V : 100; // Default safe wind speed
    
    const [Iw, iw_ref] = getImportanceFactor(riskCat, standard);
    const constant = units === 'imperial' ? 0.00256 : 0.613;
    
    let qz, ref_note;
    if (standard === 'ASCE 7-16') {
        qz = constant * safeKz * safeKzt * safeKd * safeKe * (safeV * safeV);
        ref_note = "ASCE 7-16 Eq. 26.10-1";
    } else {
        qz = constant * safeKz * safeKzt * safeKd * safeKe * Iw * (safeV * safeV);
        ref_note = `ASCE 7-22 Eq. 26.10-1 (Iw = ${Iw.toFixed(2)} from ${iw_ref})`;
    }
    
    // Final validation
    if (!isFinite(qz) || qz < 0) {
        console.warn("Invalid qz calculated, using fallback");
        qz = units === 'imperial' ? 10.0 : 500.0; // Reasonable fallback
        ref_note += " - Fallback value used due to calculation issue";
    }
    
    return { qz, ref_note };
}

// Design pressure p = qz(G*Cp - GCpi)
// Reference: ASCE 7-16/22 Eq. 27.4-1 (MWFRS)
function calculateDesignPressure(qz, G, Cp, GCpi) {
        return qz * (G * Cp - GCpi);
    }

    // --- C&C Calculation Helpers for h > 60 ft ---

    function calculateWallPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Wall Zone 4': { pos: [0.9, 0.9, 0.8], neg: [-1.0, -0.9, -0.8] },
            'Wall Zone 5': { pos: [0.9, 0.9, 0.8], neg: [-1.2, -1.1, -1.0] }
        };
        const log_areas = gcp_data.areas.map(Math.log);
        const log_A = Math.log(A);

        const results = {};
        for (const zone of ['Wall Zone 4', 'Wall Zone 5']) {
            const pos_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, gcp_data[zone].pos));
            const neg_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, gcp_data[zone].neg));
            
            results[zone] = {
                positive: interpolate(h, gcp_data.heights, pos_vals_at_h),
                negative: interpolate(h, gcp_data.heights, neg_vals_at_h)
            };
        }
        return results;
    }

    function calculateSteepRoofCandC(A, h, theta) {
        // ASCE 7-16 Figure 30.5-2 for Steep Roofs (theta > 7 deg)
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Zone 1\'': { pos: [0.7, 0.5, 0.3], neg: [-1.0, -0.9, -0.7] },
            'Zone 2\'': { pos: [0.9, 0.7, 0.5], neg: [-1.8, -1.4, -1.0] },
            'Zone 3\'': { pos: [1.3, 1.0, 0.7], neg: [-2.6, -2.0, -1.4] }
        };
        const log_areas = gcp_data.areas.map(Math.log);
        const log_A = Math.log(A);

        const results = {};
        for (const zone of ['Zone 1\'', 'Zone 2\'', 'Zone 3\'']) {
            const pos_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, gcp_data[zone].pos));
            const neg_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, gcp_data[zone].neg));

            results[zone] = {
                positive: interpolate(h, gcp_data.heights, pos_vals_at_h),
                negative: interpolate(h, gcp_data.heights, neg_vals_at_h)
            };
        }
        return results;
    }

    function calculateLowSlopeRoofPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Roof Zone 1\'': { pos: [0.7, 0.5, 0.3], neg: [-1.1, -0.9, -0.7] },
            'Roof Zone 2\'': { pos: [0.7, 0.5, 0.3], neg: [-1.8, -1.4, -1.0] },
            'Roof Zone 3\'': { pos: [0.7, 0.5, 0.3], neg: [-2.6, -2.0, -1.4] }
        };
        const log_areas = gcp_data.areas.map(Math.log);
        const log_A = Math.log(A);

        const results = {};
        for (const zone of ['Roof Zone 1\'', 'Roof Zone 2\'', 'Roof Zone 3\'']) {
            const pos_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, gcp_data[zone].pos));
            const neg_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, gcp_data[zone].neg));

            results[zone] = {
                positive: interpolate(h, gcp_data.heights, pos_vals_at_h),
                negative: interpolate(h, gcp_data.heights, neg_vals_at_h)
            };
        }
        return results;
    }

    // Enhanced C&C calculation function
    function calculateCandCPressuresEnhanced(inputs, qh, GCpi_abs) {
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type, unit_system } = inputs;
        const h = mean_roof_height;
        const A = effective_wind_area;
        const is_high_rise = unit_system === 'imperial' ? h > 60 : h > 18.3;
        const warnings = [];
        
        // ASCE 7-16 Chapter 30, Part 2: Buildings with h > 60 ft
        if (is_high_rise) {
            const results = {};
            
            // Wall pressures (Figure 30.5-1)
            const wallPressures = calculateWallPressuresHighRise(A, h);
            Object.assign(results, wallPressures);
            
            // Roof pressures based on roof type and slope
            const is_low_slope = roof_slope_deg <= 7;
            if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && is_low_slope)) {
                Object.assign(results, calculateLowSlopeRoofPressuresHighRise(A, h));
            } else if (['gable', 'hip'].includes(roof_type) && !is_low_slope) {
                // ASCE 7-16 Fig 30.5-2 (Steep Roofs) applies to both gables and hips with theta > 7 deg
                Object.assign(results, calculateSteepRoofCandC(A, h, roof_slope_deg));
            } else {
                // Add a warning for unsupported roof types in high-rise C&C calculations
                warnings.push(`C&C pressures for '${roof_type}' roofs on high-rise buildings (h > 60ft) are not explicitly covered by the prescriptive methods in ASCE 7-16 Ch. 30 and are not calculated.`);
            }
            
            // Convert GCp to pressures
            const finalPressures = {};
            for (const [zone, gcps] of Object.entries(results)) {
                // Ensure gcps has the expected structure to avoid errors
                if (typeof gcps.positive !== 'number' || typeof gcps.negative !== 'number') continue;

                // Check all 4 combinations of external and internal pressures
                const p1 = qh * (gcps.positive - GCpi_abs);  // GCp(+) - GCpi(+)
                const p2 = qh * (gcps.positive - (-GCpi_abs)); // GCp(+) - GCpi(-)
                const p3 = qh * (gcps.negative - GCpi_abs);  // GCp(-) - GCpi(+)
                const p4 = qh * (gcps.negative - (-GCpi_abs)); // GCp(-) - GCpi(-)

                finalPressures[zone] = {
                    gcp_pos: gcps.positive,
                    gcp_neg: gcps.negative,
                    p_pos: Math.max(p1, p2, p3, p4), // Max positive (inward) pressure
                    p_neg: Math.min(p1, p2, p3, p4)  // Max negative (outward) pressure
                };
            }
            
            return { 
                applicable: true, 
                pressures: finalPressures, 
                ref: `ASCE 7-16 Ch. 30, Part 2 (h > ${unit_system === 'imperial' ? '60ft' : '18.3m'})`,
                is_high_rise: true,
                warnings: warnings
            };
        }
        
        // Fallback to existing h <= 60 ft calculations
        return calculateLowRiseCandCPressures(inputs, qh, GCpi_abs);
    }

    // Data store for ASCE 7-16 C&C GCp values for low-rise buildings (h <= 60ft)
    const GCP_DATA = {
        wall: {
            zone4: [-1.1, -1.1, -1.1, -1.1, -1.0, -0.9], // Fig 30.3-1
            zone5: [-1.4, -1.3, -1.2, -1.1, -1.0, -0.9]  // Fig 30.3-1
        },
        gable: { // Fig 30.3-2
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5],
                zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5],
                zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5]
            }
        },
        hip: { // Fig 30.3-3
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5], zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5],
                zone1E: [-1.3, -1.3, -1.1, -1.0, -0.7, -0.5], zone2E: [-2.2, -2.0, -1.6, -1.3, -0.8, -0.5], zone3E: [-2.8, -2.5, -2.0, -1.5, -0.8, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5], zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5],
                zone1E: [-1.5, -1.5, -1.3, -1.1, -0.7, -0.5], zone2E: [-2.5, -2.3, -1.8, -1.4, -0.8, -0.5], zone3E: [-3.3, -3.0, -2.3, -1.7, -0.8, -0.5]
            }
        }
    };

    /**
     * Helper to get GCp values for different roof types by interpolating based on slope.
     */
    function getGcpValuesForRoof(roof_type, theta) {
        const roofData = GCP_DATA[roof_type];
        if (!roofData) return {};

        const interpolate_gcp_array = (arrA, arrB) => arrA.map((valA, i) => interpolate(theta, [7, 27], [valA, arrB[i]]));

        if (theta <= 7) return roofData.caseA;
        if (theta > 45) return roofData.caseB; // Per figures, use Case B for theta > 27
        if (theta > 7 && theta <= 27) {
            const interpolated_gcp = {};
            for (const zone in roofData.caseA) {
                interpolated_gcp[zone] = interpolate_gcp_array(roofData.caseA[zone], roofData.caseB[zone]);
            }
            return interpolated_gcp;
        }
        return roofData.caseB; // 27 < theta <= 45
    }

    function calculateLowRiseCandCPressures(inputs, qz, GCpi_abs) { // Refactored for readability
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type } = inputs;
        const A = effective_wind_area;
        const theta = roof_slope_deg;

        // Setup for logarithmic interpolation based on effective wind area
        const area_points = [10, 20, 50, 100, 500, 1000];
        const log_area_points = area_points.map(Math.log);
        const log_A = Math.log(A);
        const logInterpolate = (gcp_values) => interpolate(log_A, log_area_points, gcp_values);

        const gcp_map = {};

        // Wall Pressures (Fig 30.3-1)
        gcp_map['Wall Zone 4 (Interior)'] = logInterpolate(GCP_DATA.wall.zone4);
        gcp_map['Wall Zone 5 (Corners)'] = logInterpolate(GCP_DATA.wall.zone5);

        // Roof Pressures
        if (['gable', 'hip'].includes(roof_type)) {
            const roof_gcp_arrays = getGcpValuesForRoof(roof_type, theta);
            const zone_map = { zone1: 'Roof Zone 1 (Interior)', zone2: 'Roof Zone 2 (Edges)', zone3: 'Roof Zone 3 (Corners)', zone1E: 'Roof End Zone 1E', zone2E: 'Roof End Zone 2E', zone3E: 'Roof End Zone 3E' };
            for (const zone in roof_gcp_arrays) {
                gcp_map[zone_map[zone]] = logInterpolate(roof_gcp_arrays[zone]);
            }
        }

        const final_pressures = {};
        for (const zone in gcp_map) {
            const gcp = gcp_map[zone];
            // p = qh * (GCp - GCpi)
            const p_pos_gcp = qz * (gcp - (-GCpi_abs)); // Uplift GCp is negative, check with internal suction
            const p_neg_gcp = qz * (gcp - (+GCpi_abs)); // Uplift GCp is negative, check with internal pressure
            final_pressures[zone] = {
                gcp: gcp,
                p_pos: Math.max(p_pos_gcp, p_neg_gcp), // Not typical for these figures, but for completeness
                p_neg: Math.min(p_pos_gcp, p_neg_gcp) // C&C is usually governed by suction
            };
        }
        return { applicable: true, pressures: final_pressures, ref: "ASCE 7 Ch. 30, Part 1 (h<=60ft)" };
    }

    function calculateHeightVaryingPressures(inputs, intermediate_globals) {
        const { Kzt, exposure_category, unit_system, risk_category, mean_roof_height } = inputs;
        const { Kd, Ke, V_in, effective_standard, abs_gcpi, G } = intermediate_globals;
        const results = [];

        if (!inputs || !intermediate_globals || mean_roof_height <= 0 || !exposure_category) {
            console.error("Invalid inputs for height varying pressure calculation:", {inputs, intermediate_globals});
            return [];
        }

        const is_imp = unit_system === 'imperial';
        const step = is_imp ? 5 : 1.5; // Finer resolution for the chart
        const heights = [];
        // Simplified and corrected height generation loop
        for (let z = 0; z < mean_roof_height; z += step) {
            heights.push(z);
        }
        heights.push(mean_roof_height); // Ensure the roof height is always the last point

        // Use a for...of loop to allow early exit on error
        for (const z of heights) {
            const { Kz } = calculateKz(z, exposure_category, unit_system);
            if (isNaN(Kz) || !isFinite(Kz)) {
                console.error("Invalid Kz calculated for height:", z, "Kz:", Kz);
                return []; // Exit function if Kz is invalid
            }

            const { qz } = calculateVelocityPressure(Kz, Kzt, Kd, Ke, V_in, effective_standard, risk_category, unit_system);
            if (isNaN(qz) || !isFinite(qz)) {
                console.error("Invalid qz calculated for height:", z, "qz:", qz);
                return []; // Exit function if qz is invalid
            }

            const p_pos_windward = calculateDesignPressure(qz, G, 0.8, abs_gcpi);
            const p_neg_windward = calculateDesignPressure(qz, G, 0.8, -abs_gcpi);

            results.push({ height: z, Kz, qz, p_pos: p_pos_windward, p_neg: p_neg_windward });
        }
        return results;
    }

    /**
     * Retrieves constants for gust effect factor calculation from ASCE 7-16 Table 26.11-1.
     */
    function getGustCalculationConstants(exposure_category, unit_system) {
        const constants = {
            'B': { b_bar: 0.47, c: 0.30, l: 320, epsilon_bar: 1/3.0 },
            'C': { b_bar: 0.65, c: 0.20, l: 500, epsilon_bar: 1/5.0 },
            'D': { b_bar: 0.80, c: 0.15, l: 650, epsilon_bar: 1/8.0 }
        };
        const metric_multipliers = { b_bar: 1.32, c: 1.5, l: 0.3048, epsilon_bar: 1.0 };

        let data = constants[exposure_category] || constants['C']; // Default to C

        if (unit_system === 'metric') {
            data = {
                b_bar: data.b_bar * metric_multipliers.b_bar,
                c: data.c * metric_multipliers.c,
                l: data.l * metric_multipliers.l,
                epsilon_bar: data.epsilon_bar
            };
        }
        return data;
    }

    /**
     * Calculates the mean hourly wind speed at a given height.
     */
    function calculateMeanHourlyWindSpeed(V_in, z_effective, zg, alpha, b_bar) {
        const V_bar_33ft = V_in * b_bar * Math.pow(33 / zg, 1 / alpha) * (88/60); // Convert mph to fps
        return V_bar_33ft * Math.pow(z_effective / 33, 1 / alpha);
    }

    /**
     * Calculates the resonant response factor, R.
     */
    function calculateResonantResponseFactor(n1, V_z_bar, Lz_bar) {
        const damping_ratio = 0.01; // Assumed for steel/concrete buildings
        const N1 = (n1 * Lz_bar) / V_z_bar;
        const Rn = (7.47 * N1) / Math.pow(1 + 10.3 * N1, 5/3);
        const Rh = (1 / N1) - (1 / (2 * N1 * N1)) * (1 - Math.exp(-2 * N1));
        const RB = Rh; // For simplicity, assuming B=h, so Rh = RB

        return Math.sqrt((1 / damping_ratio) * Rn * Rh * RB);
    }

    /**
     * Calculates the Gust Effect Factor G for flexible structures per ASCE 7-16 Section 26.11.
     */
    function calculateGustEffectFactor(inputs, intermediate) { // Refactored for readability
        if (inputs.building_flexibility !== 'Flexible' || !inputs.fundamental_period) {
            return { G: 0.85, ref: "ASCE 7-16 Sec. 26.11.1 (Rigid Structure)" };
        }
    
        const { V_in, unit_system, mean_roof_height, building_length_L, building_width_B, exposure_category } = inputs;
        const { alpha, zg } = intermediate;
        const n1 = 1 / inputs.fundamental_period;

        const { b_bar, c, l, epsilon_bar } = getGustCalculationConstants(exposure_category, unit_system);

        const z_bar = 0.6 * mean_roof_height;
        const min_z = unit_system === 'imperial' ? 15.0 : 4.6;
        const z_bar_effective = Math.max(z_bar, min_z);
        
        const V_z_bar = calculateMeanHourlyWindSpeed(V_in, z_bar_effective, zg, alpha, b_bar);
        const Iz_bar = c * Math.pow(33 / z_bar_effective, 1/6);
        const ref_h = unit_system === 'imperial' ? 33 : 10; // 33 ft or 10 m
        const Lz_bar = l * Math.pow(z_bar_effective / ref_h, epsilon_bar);
    
        const gQ = 3.4; // ASCE 7-16 Section 26.11.2, typically 3.4
        const gR = Math.sqrt(2 * Math.log(3600 * n1)) + (0.577 / Math.sqrt(2 * Math.log(3600 * n1)));
    
        const Q = Math.sqrt(1 / (1 + 0.63 * Math.pow(Math.max(mean_roof_height, building_length_L) / Lz_bar, 0.63)));
        const R = calculateResonantResponseFactor(n1, V_z_bar, Lz_bar);

        const Gf = (1 + 1.7 * Iz_bar * Math.sqrt(gQ*gQ * Q*Q + gR*gR * R*R)) / (1 + 1.7 * gQ * Iz_bar);
    
        return {
            G: Gf,
            ref: `ASCE 7-16 Eq. 26.11-6 (Flexible, G=${Gf.toFixed(3)})`
        };
    }

    function calculateRoofPressureByDistance(inputs, intermediate_globals, cp_map, building_dimension_parallel_to_wind) {
        const { gust_effect_factor_g } = inputs;
        const { qz, abs_gcpi } = intermediate_globals;
        const results = [];
        const L = building_dimension_parallel_to_wind;

        // Create an array of distances to evaluate
        const distances = [];
        for (let i = 0; i <= 20; i++) { // Evaluate at 21 points (every 5%)
            distances.push(L * (i / 20));
        }

        // Create a lookup from the cp_map
        const roof_zones = [];
        for (const [surface, cp] of Object.entries(cp_map)) {
            if (!surface.toLowerCase().includes('roof')) continue; // Only consider roof surfaces
            // Regex to find zones like "Roof (0 to 30 ft)"
            const matches = surface.match(/\((\d+(\.\d+)?)\s*to\s*(\d+(\.\d+)?)/);
            if (matches) {
                roof_zones.push({ start: parseFloat(matches[1]), end: parseFloat(matches[3]), cp });
            }
        }

        distances.forEach(dist => {
            // Find the correct Cp value for the current distance from the pre-calculated zones
            let cp_at_dist = roof_zones.find(zone => dist >= zone.start && dist <= zone.end)?.cp ?? 
                             (cp_map["Leeward Roof"] || cp_map["Roof Leeward"] || -0.3); // Fallback to leeward value

            const p_pos = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, -abs_gcpi);
            const distance_ratio = L > 0 ? dist / L : 0;
            results.push({ distance: dist, cp: cp_at_dist, p_pos, p_neg, distance_ratio });
        });

        return results;
    }

    // --- PUBLIC API ---
    function run(inputs, validation) {
        let effective_standard = inputs.asce_standard;
        let v_input = inputs.basic_wind_speed;
        let v_unreduced = inputs.basic_wind_speed;
        let jurisdiction_note = "", temporary_structure_note = "";

        if (inputs.jurisdiction === "NYCBC 2022") {
            effective_standard = "ASCE 7-16";
            const risk_v_map = { "I": 110, "II": 117, "III": 127, "IV": 132 };
            v_input = risk_v_map[inputs.risk_category] || 117;
            v_unreduced = v_input;
            jurisdiction_note = `NYCBC 2022 wind speed of ${v_input} mph for Risk Category ${inputs.risk_category} has been applied (Table 1609.3).`;
        }

        if (inputs.temporary_construction === "Yes") {
            v_input *= 0.8;
            const v_unit = inputs.unit_system === 'imperial' ? 'mph' : 'm/s';
            temporary_structure_note = `A 0.8 reduction factor has been applied for temporary construction (PROJECT-SPECIFIC ALLOWANCE, NOT ASCE 7). Calculation wind speed is ${v_input.toFixed(1)} ${v_unit} (reduced from ${v_unreduced} ${v_unit}).`;
        }

        const [abs_gcpi, gcpi_ref] = getInternalPressureCoefficient(inputs.enclosure_classification);
        const [Kd, kd_ref] = getKdFactor(inputs.structure_type_for_kd);
        const [Ke, ke_ref] = calculateKe(inputs.ground_elevation, inputs.unit_system, effective_standard);
        const { Kz, alpha, zg, ref_note: kz_ref } = calculateKz(inputs.mean_roof_height, inputs.exposure_category, inputs.unit_system);
        const { qz, ref_note: qz_ref } = calculateVelocityPressure(Kz, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);
        const [Iw, iw_ref] = getImportanceFactor(inputs.risk_category, effective_standard);
        
        const intermediate_for_G = { alpha, zg, Kz, Iw };
        const { G, ref: g_ref } = calculateGustEffectFactor({ ...inputs, V_in: v_input }, intermediate_for_G);

        const windResults = {
            inputs: { ...inputs, V_in: v_input, V_unreduced: v_unreduced, GCpi_abs: abs_gcpi, effective_standard: effective_standard, effective_wind_area: inputs.effective_wind_area },
            intermediate: { Kz, Kz_ref: kz_ref, Ke, ke_ref, qz, qz_ref, Kd, Kd_ref: kd_ref, GCpi_ref: gcpi_ref, alpha, zg, Iw, iw_ref },
            directional_results: {}, jurisdiction_note, temporary_structure_note, 
            warnings: validation.warnings, errors: validation.errors
        };

        // Handle Open Buildings separately as they use Net Pressure Coefficients (CN)
        if (inputs.enclosure_classification === 'Open') {
            if (['monoslope', 'pitched_troughed'].includes(inputs.roof_type)) {
                const { cnMap, ref } = getOpenBuildingCnValues(inputs.roof_slope_deg, inputs.wind_obstruction === 'obstructed');
                windResults.directional_results['open_roof'] = Object.entries(cnMap).map(([surface, cn_vals]) => {
                    // p = qh * G * CN (ASCE 7-16 Eq. 27.3-2)
                    const p_pos = qz * inputs.gust_effect_factor_g * cn_vals.cn_pos;
                    const p_neg = qz * inputs.gust_effect_factor_g * cn_vals.cn_neg;
                    return { surface, cp: null, cn_pos: cn_vals.cn_pos, cn_neg: cn_vals.cn_neg, p_pos, p_neg, p_pos_asd: p_pos * 0.6, p_neg_asd: p_neg * 0.6 };
                });
                windResults.open_building_ref = ref;
            } else {
                windResults.warnings.push("For Open buildings, only 'Monoslope' and 'Pitched/Troughed' roof types are currently supported by this calculator.");
            }
            return windResults;
        }

        const is_tall_building = inputs.mean_roof_height > (inputs.unit_system === 'imperial' ? 60 : 18.3);

        if (is_tall_building) {
            windResults.mwfrs_method = "Analytical Procedure (All Heights)";
            const { cpMap: cp_map_L } = getAnalyticalCpValues(inputs.mean_roof_height, inputs.building_length_L, inputs.building_width_B, inputs.roof_type, inputs.roof_slope_deg);
            windResults.directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => {
                // For windward wall, pressure varies with height z. We show pressure at h.
                const p_pos = calculateDesignPressure(qz, G, cp, abs_gcpi);
                const p_neg = calculateDesignPressure(qz, G, cp, -abs_gcpi);
                return { surface, cp, p_pos, p_neg };
            });

            const { cpMap: cp_map_B } = getAnalyticalCpValues(inputs.mean_roof_height, inputs.building_width_B, inputs.building_length_L, inputs.roof_type, inputs.roof_slope_deg);
             windResults.directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => {
                const p_pos = calculateDesignPressure(qz, G, cp, abs_gcpi);
                const p_neg = calculateDesignPressure(qz, G, cp, -abs_gcpi);
                return { surface, cp, p_pos, p_neg };
            });

            const intermediate_globals = { Kd, Ke, V_in: v_input, effective_standard, abs_gcpi, qz, G };
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures({ ...inputs, building_length_L: inputs.building_length_L, building_width_B: inputs.building_width_B }, intermediate_globals);
            windResults.heightVaryingResults_B = calculateHeightVaryingPressures({ ...inputs, building_length_L: inputs.building_width_B, building_width_B: inputs.building_length_L }, intermediate_globals);
            
        } else { // Low-Rise Building
            windResults.mwfrs_method = "Directional Procedure (Low-Rise)";
            const { cpMap: cp_map_L } = getCpValues(effective_standard, inputs.mean_roof_height, inputs.building_length_L, inputs.building_width_B, inputs.roof_type, inputs.roof_slope_deg, inputs.unit_system);
            windResults.directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => {
                const p_pos = calculateDesignPressure(qz, G, cp, abs_gcpi);
                const p_neg = calculateDesignPressure(qz, G, cp, -abs_gcpi);
                return { surface, cp, p_pos, p_neg };
            });

            const { cpMap: cp_map_B } = getCpValues(effective_standard, inputs.mean_roof_height, inputs.building_width_B, inputs.building_length_L, inputs.roof_type, inputs.roof_slope_deg, inputs.unit_system);
            windResults.directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => {
                const p_pos = calculateDesignPressure(qz, G, cp, abs_gcpi);
                const p_neg = calculateDesignPressure(qz, G, cp, -abs_gcpi);
                return { surface, cp, p_pos, p_neg };
            });

            const intermediate_globals = { Kd, Ke, V_in: v_input, effective_standard, abs_gcpi, qz, G };
            windResults.roofPressureDist_L = calculateRoofPressureByDistance(inputs, intermediate_globals, cp_map_L, inputs.building_length_L);
            windResults.roofPressureDist_B = calculateRoofPressureByDistance(inputs, intermediate_globals, cp_map_B, inputs.building_width_B);
        }

        // Calculate C&C pressures
        const candc_results = calculateCandCPressuresEnhanced(inputs, qz, abs_gcpi);
        windResults.candc = candc_results;
        if (candc_results.warnings && candc_results.warnings.length > 0) {
            windResults.warnings.push(...candc_results.warnings);
        }

        // Torsional Load Case (ASCE 7-16/22 Fig 27.4-8, Case 2)
        // Applies to enclosed and partially enclosed low-rise buildings
        if (!is_tall_building && ["Enclosed", "Partially Enclosed"].includes(inputs.enclosure_classification)) {
            const is_imp = inputs.unit_system === 'imperial';
            const cp_map_L = Object.fromEntries(windResults.directional_results['perp_to_L'].map(r => [r.surface, r.cp]));
            const cp_map_B = Object.fromEntries(windResults.directional_results['perp_to_B'].map(r => [r.surface, r.cp]));

            // Wind perpendicular to L (acting on face B)
            const p_ww_L = qz * G * (cp_map_L["Windward Wall"] || 0);
            const p_lw_L = qz * G * (cp_map_L["Leeward Wall"] || 0);
            const F_ww_L = p_ww_L * (inputs.building_width_B * inputs.mean_roof_height);
            const F_lw_L = p_lw_L * (inputs.building_width_B * inputs.mean_roof_height);
            const Mt_L = 0.75 * (Math.abs(F_ww_L) + Math.abs(F_lw_L)) * (0.15 * inputs.building_width_B);

            // Wind perpendicular to B (acting on face L)
            const p_ww_B = qz * G * (cp_map_B["Windward Wall"] || 0);
            const p_lw_B = qz * G * (cp_map_B["Leeward Wall"] || 0);
            const F_ww_B = p_ww_B * (inputs.building_length_L * inputs.mean_roof_height);
            const F_lw_B = p_lw_B * (inputs.building_length_L * inputs.mean_roof_height);
            const Mt_B = 0.75 * (Math.abs(F_ww_B) + Math.abs(F_lw_B)) * (0.15 * inputs.building_length_L);
            
            windResults.torsional_case = {
                perp_to_L: { Mt: Mt_L, note: "Apply with 75% of Case 1 wall pressures." },
                perp_to_B: { Mt: Mt_B, note: "Apply with 75% of Case 1 wall pressures." }
            };
        }

        return windResults;
    }

    return { run };
})();

const validationRules = {
    wind: {
        'mean_roof_height': { min: 0, max: 2000, required: true, label: 'Mean Roof Height' },
        'basic_wind_speed': { min: 0, max: 300, required: true, label: 'Basic Wind Speed' },
        'building_length_L': { min: 0, required: true, label: 'Building Length (L)' },
        'building_width_B': { min: 0, required: true, label: 'Building Width (B)' },
        'roof_slope_deg': { min: 0, max: 90, required: true, label: 'Roof Slope' }
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

    // Add specific, inter-dependent validation logic
    if (type === 'wind') {
        if (['gable', 'hip'].includes(inputs.roof_type) && inputs.roof_slope_deg > 45) {
            errors.push("Gable/hip roof slope must be <= 45° for this calculator's implementation of ASCE 7 Fig 27.3-2.");
        }
        const isImperial = inputs.unit_system === 'imperial';
        const vRange = isImperial ? [85, 200] : [38, 90];
        if (inputs.basic_wind_speed < vRange[0] || inputs.basic_wind_speed > vRange[1]) {
            warnings.push(`Wind speed ${inputs.basic_wind_speed} ${isImperial ? 'mph' : 'm/s'} is outside the typical ASCE 7 range (${vRange[0]}-${vRange[1]}).`);
        }
    }
    return { errors, warnings };
}

function handleRunWindCalculation() {
    const inputs = gatherInputsFromIds(windInputIds);
    const validation = validateInputs(inputs, 'wind');
    if (validation.errors.length > 0) {
        renderValidationResults(validation, document.getElementById('results-container'));
        return;
    }

    setLoadingState(true);
    const results = safeCalculation(
        () => windLoadCalculator.run(inputs, validation),
        'An unexpected error occurred during the wind calculation.'
    );

    if (results.error) {
        setLoadingState(false);
        renderValidationResults({ errors: [results.error] }, document.getElementById('results-container'));
        return;
    }
    renderWindResults(results);
    setLoadingState(false);
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

function renderRoofPressureChart(canvasId, pressureData, building_dimension, design_method, units) {
    const factor = design_method === 'ASD' ? 0.6 : 1.0;
    const labels = pressureData.map(p => p.distance.toFixed(1));
    const data = pressureData.map(p => (p.p_neg * factor).toFixed(2));

    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Roof Suction (${units.p_unit})`,
                data: data,
                borderColor: '#3b82f6', // blue-500
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Pressure Distribution (Length: ${building_dimension} ${units.h_unit})`
                },
                legend: { display: false }
            },
            scales: {
                x: {
                    title: { display: true, text: `Distance from Windward Edge (${units.h_unit})` }
                },
                y: {
                    title: { display: true, text: `Pressure (${units.p_unit})` }
                }
            }
        }
    });
}

function renderWindResults(results) {
     if (!results) return;
     lastWindRunResults = results; // Cache the results

     const resultsContainer = document.getElementById('results-container');

    const { inputs, intermediate, directional_results, jurisdiction_note, temporary_structure_note, warnings, torsional_case, open_building_ref, candc, mwfrs_method, heightVaryingResults_L, heightVaryingResults_B, roofPressureDist_L, roofPressureDist_B } = results;
    const is_imp = inputs.unit_system === 'imperial';
    const [v_unit, h_unit, p_unit] = is_imp ? ['mph', 'ft', 'psf'] : ['m/s', 'm', 'Pa'];

    let html = `<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2">
                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
                   </div>`;

    html += `<div class="text-center border-b pb-4">
                    <h2 class="text-2xl font-bold">WIND LOAD REPORT (${inputs.effective_standard})</h2>
                </div>`;

    if (jurisdiction_note) html += `<div class="bg-blue-100 dark:bg-blue-900/50 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-4 rounded-md"><p><strong>Jurisdiction Note:</strong> ${jurisdiction_note}</p></div>`;
    if (temporary_structure_note) html += `<div class="bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-300 p-4 rounded-md"><p><strong>Project-Specific Allowance:</strong> ${temporary_structure_note}</p></div>`;
    if (warnings && warnings.length > 0) {
        html += renderValidationResults({ warnings, errors: [] });
    }
    
    // Handle Open Building Results
    if (inputs.enclosure_classification === 'Open') {
        html += `<div class="text-center pt-4"><h3 class="text-xl font-bold">NET DESIGN PRESSURES (p = q_h*G*C_N)</h3></div>`;
        let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>Open Building Free Roof Pressures (${open_building_ref})</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr>
                <th>Roof Zone</th><th>C_N,pos</th><th>C_N,neg</th><th>Positive Pressure [${p_unit}]</th><th>Negative Pressure [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300">`;
        
        directional_results.open_roof.forEach(r => {
            const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
            tableHtml += `
                <tr>
                    <td>${r.surface}</td>
                    <td>${r.cn_pos.toFixed(2)}</td>
                    <td>${r.cn_neg.toFixed(2)}</td>
                    <td>${p_pos.toFixed(2)}</td>
                    <td>${p_neg.toFixed(2)}</td>
                </tr>`;
        });
        tableHtml += `</tbody></table>`;
        html += tableHtml;
        html += `</div>`; // Close main container
        resultsContainer.innerHTML = html;
        return;
    }

    const renderDirectionalResults = (data, title, id_prefix) => {
        let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>${title}</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr>
                <th>Surface/Zone</th><th>C_p</th><th>Pressure (+GCpi) [${p_unit}]</th><th>Pressure (-GCpi) [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300">`;
        
        data.forEach((r, i) => {
            const p_pos = inputs.design_method === 'ASD' ? r.p_pos * 0.6 : r.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? r.p_neg * 0.6 : r.p_neg;
            const detailId = `${id_prefix}-detail-${i}`;
            tableHtml += `
                <tr>
                    <td>${r.surface} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${r.cp.toFixed(2)}</td>
                    <td>${p_pos.toFixed(2)}</td>
                    <td>${p_neg.toFixed(2)}</td>
                </tr>
                <tr id="${detailId}" class="details-row"><td colspan="4" class="p-0"><div class="calc-breakdown">
                        <h4>Calculation for ${r.surface}</h4>
                        <ul><li>p = qz * (G*Cp - GCpi) = ${intermediate.qz.toFixed(2)} * (${inputs.gust_effect_factor_g}*${r.cp.toFixed(2)} - &plusmn;${inputs.GCpi_abs})</li></ul>
                    </div></td></tr>`;
        });
        tableHtml += `</tbody></table>`;
        return tableHtml;
    };

    const res_list_L = directional_results.perp_to_L;
    const res_list_B = directional_results.perp_to_B;
    html += `
        <div class="text-center pt-4"><h3 class="text-xl font-bold">MWFRS DESIGN PRESSURES (${mwfrs_method})</h3></div>
        <div>
            <h4 class="text-lg font-semibold mt-6 mb-2 text-center">Wind Perpendicular to ${inputs.building_length_L} ${h_unit} Side (on ${inputs.building_width_B} ${h_unit} face)</h4>
            <div class="diagram my-4">
                <svg viewBox="0 0 400 250" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                    <defs><marker id="arrow-result" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="fill-current text-gray-600 dark:text-gray-400"/></marker></defs>
                    <rect x="100" y="50" width="200" height="150" class="svg-member"/>
                    <text x="200" y="40" class="svg-dim-text">Side Wall (${inputs.building_length_L} ${h_unit})</text>
                    <text x="200" y="210" class="svg-dim-text">Side Wall (${inputs.building_length_L} ${h_unit})</text>
                    <text x="85" y="125" class="svg-dim-text" transform="rotate(-90, 85, 125)">Windward Wall (${inputs.building_width_B} ${h_unit})</text>
                    <text x="315" y="125" class="svg-dim-text" transform="rotate(90, 315, 125)">Leeward Wall (${inputs.building_width_B} ${h_unit})</text>
                    <path d="M20 125 L 90 125" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-result)"/>
                    <text x="40" y="115" class="svg-label">WIND</text>
                </svg>
            </div>
            ${renderDirectionalResults(res_list_L, `--- ${inputs.design_method} Pressures ---`, 'L')}
        </div>
        <div>
            <h4 class="text-lg font-semibold mt-8 mb-2 text-center">Wind Perpendicular to ${inputs.building_width_B} ${h_unit} Side (on ${inputs.building_length_L} ${h_unit} face)</h4>
            <div class="diagram my-4">
                <svg viewBox="0 0 400 250" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                    <rect x="50" y="75" width="300" height="100" class="svg-member"/>
                    <text x="15" y="125" class="svg-dim-text" transform="rotate(-90, 15, 125)">Side Wall (${inputs.building_width_B} ${h_unit})</text>
                    <text x="385" y="125" class="svg-dim-text" transform="rotate(90, 385, 125)">Side Wall (${inputs.building_width_B} ${h_unit})</text>
                    <text x="200" y="65" class="svg-dim-text">Leeward Wall (${inputs.building_length_L} ${h_unit})</text>
                    <text x="200" y="185" class="svg-dim-text">Windward Wall (${inputs.building_length_L} ${h_unit})</text>
                    <path d="M200 230 L 200 185" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-result)"/>
                    <text x="200" y="215" class="svg-label">WIND</text>
                </svg>
            </div>
            ${renderDirectionalResults(res_list_B, `--- ${inputs.design_method} Pressures ---`, 'B')}
        </div>
        `;
    
    if (heightVaryingResults_L) {
        const leeward_pressure_L = res_list_L.find(r => r.surface.includes("Leeward"))?.p_pos || 0;
        const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;

        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <h3 class="text-xl font-semibold text-center mb-4">Height-Varying Windward Wall Pressures</h3>
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Leeward wall pressure is constant and based on q<sub>h</sub>.</p>
                    <table class="w-full mt-4 border-collapse">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th>Height (${h_unit})</th>
                                <th>Kz</th>
                                <th>qz (${p_unit})</th>
                                <th>Windward Wall Pressure (${p_unit})</th>
                            </tr>
                        </thead>
                        <tbody class="dark:text-gray-300 text-center">`;
        heightVaryingResults_L.forEach(result => {
            html += `
                <tr>
                    <td>${result.height.toFixed(1)}</td>
                    <td>${result.Kz.toFixed(3)}</td>
                    <td>${result.qz.toFixed(2)}</td>
                    <td>${(result.p_pos * factor).toFixed(2)}</td>
                </tr>`;
        });
        html += `   <tr>
                        <td colspan="3" class="text-right font-semibold pr-4">Constant Leeward Pressure (Perp. to L):</td>
                        <td>${(leeward_pressure_L * factor).toFixed(2)}</td>
                    </tr>
                    </tbody></table>
                 </div>`;
    }

    if (roofPressureDist_L && roofPressureDist_B) {
        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <h3 class="text-xl font-semibold text-center mb-4">Roof Pressure Distribution Chart</h3>
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Pressure variation along the roof surface, from windward to leeward edge.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div style="height: 300px;"><canvas id="roofChartL"></canvas></div>
                        <div style="height: 300px;"><canvas id="roofChartB"></canvas></div>
                    </div>
                 </div>`;
    }

    if (roofPressureDist_L && roofPressureDist_B) {
        const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <h3 class="text-xl font-semibold text-center mb-2">Roof Pressure Distribution (Low-Rise)</h3>
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Pressure variation along the roof surface, from windward to leeward edge.</p>
                    <div class="diagram my-4">
                        <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                            <defs><marker id="arrow-diag" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="fill-current text-gray-600 dark:text-gray-400"/></marker></defs>
                            <!-- Roof plan view -->
                            <rect x="50" y="50" width="300" height="100" class="svg-member"/>
                            <!-- Pressure zones with different colors -->
                            <rect x="50" y="50" width="60" height="100" fill="#ef4444" opacity="0.6"/> <!-- High suction -->
                            <rect x="110" y="50" width="90" height="100" fill="#facc15" opacity="0.6"/> <!-- Medium -->
                            <rect x="200" y="50" width="150" height="100" fill="#4ade80" opacity="0.6"/> <!-- Lower suction -->
                            
                            <text x="80" y="165" class="svg-dim-text" text-anchor="middle">Zone 1</text>
                            <text x="155" y="165" class="svg-dim-text" text-anchor="middle">Zone 2</text>
                            <text x="275" y="165" class="svg-dim-text" text-anchor="middle">Zone 3</text>
                            
                            <text x="200" y="35" class="svg-label">Illustrative Roof Pressure Zones</text>
                            <path d="M20 100 L 45 100" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-diag)"/>
                            <text x="25" y="95" class="svg-dim-text">WIND</text>
                        </svg>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <div style="height: 300px;"><canvas id="roofChartL"></canvas></div>
                            <table class="w-full mt-4 border-collapse text-sm">
                                <thead class="bg-gray-100 dark:bg-gray-700"><tr><th>Distance</th><th>Ratio</th><th>Cp</th><th>Pressure</th></tr></thead>
                                <tbody class="dark:text-gray-300 text-center">`;
        roofPressureDist_L.forEach(r => {
            html += `<tr>
                        <td>${r.distance.toFixed(1)}</td>
                        <td>${r.distance_ratio.toFixed(2)}</td>
                        <td>${r.cp.toFixed(2)}</td>
                        <td>${(r.p_neg * factor).toFixed(2)}</td>
                     </tr>`;
        });
        html += `           </tbody>
                            </table>
                        </div>
                        <div>
                            <div style="height: 300px;"><canvas id="roofChartB"></canvas></div>
                            <table class="w-full mt-4 border-collapse text-sm">
                                <thead class="bg-gray-100 dark:bg-gray-700"><tr><th>Distance</th><th>Ratio</th><th>Cp</th><th>Pressure</th></tr></thead>
                                <tbody class="dark:text-gray-300 text-center">`;
            roofPressureDist_B.forEach(r => {
                html += `<tr>
                            <td>${r.distance.toFixed(1)}</td>
                            <td>${r.distance_ratio.toFixed(2)}</td>
                            <td>${r.cp.toFixed(2)}</td>
                            <td>${(r.p_neg * factor).toFixed(2)}</td>
                         </tr>`;
            });
        html += `           </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
    }


    if (torsional_case) {
        const m_unit = is_imp ? 'lb-ft' : 'kN-m';
        // If metric, convert from N-m to kN-m for display
        let Mt_L = is_imp ? torsional_case.perp_to_L.Mt : torsional_case.perp_to_L.Mt / 1000;
        let Mt_B = is_imp ? torsional_case.perp_to_B.Mt : torsional_case.perp_to_B.Mt / 1000;
        if (inputs.design_method === 'ASD') {
            Mt_L *= 0.6;
            Mt_B *= 0.6;
        }

        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <h3 class="text-xl font-semibold text-center mb-4">Torsional Load Case (ASCE 7 Fig. 27.4-8, Case 2)</h3>
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">This moment must be considered concurrently with 75% of the Case 1 design wind pressures on the walls.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                        <div>
                            <p class="font-semibold">Wind Perpendicular to L</p>
                            <p class="text-2xl font-bold">${Mt_L.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                        </div>
                        <div>
                            <p class="font-semibold">Wind Perpendicular to B</p>
                            <p class="text-2xl font-bold">${Mt_B.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                        </div>
                    </div>
                 </div>`;
    }

    if (candc && candc.applicable) {
        html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <h3 class="text-xl font-semibold text-center mb-4">Components & Cladding (C&C) Pressures</h3>
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">
                        Calculated for Effective Wind Area A = ${inputs.effective_wind_area} ${is_imp ? 'ft²' : 'm²'}. Reference: ${candc.ref}.
                    </p>
                    <table class="w-full mt-4 border-collapse">`;
        if (candc.is_high_rise) {
            html += `<thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th>Zone</th>
                            <th>GCp (+)</th>
                            <th>GCp (-)</th>
                            <th>Positive Pressure [${p_unit}]</th>
                            <th>Negative Pressure [${p_unit}]</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300 text-center">`;
            for (const zone in candc.pressures) {
                const data = candc.pressures[zone];
                const p_pos = inputs.design_method === 'ASD' ? data.p_pos * 0.6 : data.p_pos;
                const p_neg = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
                html += `<tr>
                            <td>${zone}</td>
                            <td>${data.gcp_pos.toFixed(2)}</td>
                            <td>${data.gcp_neg.toFixed(2)}</td>
                            <td>${p_pos.toFixed(2)}</td>
                            <td>${p_neg.toFixed(2)}</td>
                         </tr>`;
            }
        } else {
            html += `<thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th>Zone</th>
                            <th>GCp</th>
                            <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300 text-center">`;
            for (const zone in candc.pressures) {
                const data = candc.pressures[zone];
                const pressure = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
                html += `<tr><td>${zone}</td><td>${data.gcp.toFixed(2)}</td><td>${pressure.toFixed(2)}</td></tr>`;
            }
        }
        html += `</tbody></table></div>`;
    }

    html += `</div>`;
    resultsContainer.innerHTML = html;

    // Render charts after the canvas elements are in the DOM
    if (roofPressureDist_L && roofPressureDist_B) {
        renderRoofPressureChart('roofChartL', roofPressureDist_L, inputs.building_length_L, inputs.design_method, { p_unit, h_unit });
        renderRoofPressureChart('roofChartB', roofPressureDist_B, inputs.building_width_B, inputs.design_method, { p_unit, h_unit });
    }
}

function handleSaveWindInputs() {
    const inputs = gatherInputsFromIds(windInputIds);
    saveInputsToFile(inputs, 'wind-inputs.txt');
    showFeedback('Inputs saved to wind-inputs.txt', false, 'feedback-message');
}

function handleLoadWindInputs(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const inputs = JSON.parse(e.target.result);
            windInputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && inputs[id] !== undefined) {
                    if (el.type === 'checkbox') el.checked = inputs[id];
                    else el.value = inputs[id];
                }
            });
            showFeedback('Wind inputs loaded successfully!', false, 'feedback-message');
            handleRunWindCalculation(); // Optionally re-run calculation
        } catch (err) {
            showFeedback('Failed to load inputs. Data may be corrupt.', true, 'feedback-message');
            console.error("Error parsing saved data:", err);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input to allow re-loading the same file
}