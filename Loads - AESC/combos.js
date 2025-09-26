let lastComboRunResults = null;

const comboInputIds = [
    'combo_asce_standard', 'combo_jurisdiction', 'combo_design_method', 'combo_input_load_level', 'combo_unit_system',
    'combo_dead_load_d', 'combo_live_load_l', 'combo_roof_live_load_lr', 'combo_rain_load_r', 'combo_balanced_snow_load_sb',
    'combo_unbalanced_windward_snow_load_suw', 'combo_unbalanced_leeward_snow_load_sul', 'combo_drift_surcharge_sd',
    // New wind load input IDs
    'combo_wind_wall_ww_max', 'combo_wind_wall_ww_min',
    'combo_wind_wall_lw_max', 'combo_wind_wall_lw_min',
    'combo_wind_roof_ww_max', 'combo_wind_roof_ww_min',
    'combo_wind_roof_lw_max', 'combo_wind_roof_lw_min',
    'combo_wind_cc_max', 'combo_wind_cc_min',
    'combo_wind_cc_wall_max', 'combo_wind_cc_wall_min',
    'combo_seismic_load_e',
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
        document.getElementById('run-combo-calculation-btn').addEventListener('click', handleRunComboCalculation);
        document.getElementById('save-combo-inputs-btn').addEventListener('click', handleSaveComboInputs);
        document.getElementById('load-combo-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('combo-file-input'));
        document.getElementById('combo-file-input').addEventListener('change', handleLoadComboInputs);

        attachDebouncedListeners(comboInputIds, handleRunComboCalculation);

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        document.body.addEventListener('click', async (event) => {
            if (event.target.id === 'copy-report-btn') {
                await handleCopyToClipboard('combo-results-container', 'feedback-message');
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            if (event.target.id === 'copy-summary-btn') {
                // Use the shared utility function for copying summary
                handleCopySummaryToClipboard('combo-results-container', 'feedback-message');
            }
        });
    }

    initializeApp();
});

const validationRules = {
    combo: {
        'dead_load_d': { min: 0, required: true, label: 'Dead Load (D)' },
        'live_load_l': { required: false, label: 'Live Load (L)' }, // No min/max, but present
        'roof_live_load_lr': { required: false, label: 'Roof Live Load (Lr)' },
        'rain_load_r': { required: false, label: 'Rain Load (R)' },
        'balanced_snow_load_sb': { required: false, label: 'Balanced Snow (Sb)' },
        'unbalanced_windward_snow_load_suw': { required: false, label: 'Unbalanced Windward (Suw)' },
        'unbalanced_leeward_snow_load_sul': { required: false, label: 'Unbalanced Leeward (Sul)' },
        'drift_surcharge_sd': { required: false, label: 'Drift Surcharge (Sd)' },
        'wind_wall_ww_max': { required: false, label: 'Windward Wall Max Wind' },
        'wind_wall_ww_min': { required: false, label: 'Windward Wall Min Wind' },
        'wind_wall_lw_max': { required: false, label: 'Leeward Wall Max Wind' },
        'wind_wall_lw_min': { required: false, label: 'Leeward Wall Min Wind' },
        'wind_roof_ww_max': { required: false, label: 'Windward Roof Max Wind' },
        'wind_roof_ww_min': { required: false, label: 'Windward Roof Min Wind' },
        'wind_roof_lw_max': { required: false, label: 'Leeward Roof Max Wind' },
        'wind_roof_lw_min': { required: false, label: 'Leeward Roof Min Wind' },
        'wind_cc_max': { required: false, label: 'C&C Max Wind' },
        'wind_cc_min': { required: false, label: 'C&C Min Wind' },
        'wind_cc_wall_max': { required: false, label: 'C&C Wall Max Wind' },
        'wind_cc_wall_min': { required: false, label: 'C&C Wall Min Wind' },
        'seismic_load_e': { required: false, label: 'Seismic Load (E)' }
    }
};

const comboLoadCalculator = (() => {
    function calculateCombinations(loads, standard, level, method) {
        const { D, L, Lr, R, S: S_input, W: W_input, E, unit_system } = loads;
        const adjustment_notes = {};

        let S_nominal, W_strength, S_strength, W_nominal;

        // LRFD formulas use strength-level loads. ASD formulas use nominal-level loads.
        // We adjust inputs to the required level for the formulas. W is strength-level, S is nominal for ASCE 7-16.
        if (standard === "ASCE 7-16") { // Formulas expect nominal S and strength W
            S_nominal = S_input;
            W_strength = (level === 'Nominal (Service/ASD)') ? W_input / 0.6 : W_input; // Convert ASD wind to LRFD level
            if (level === 'Nominal (Service/ASD)' && W_input !== 0) adjustment_notes['W'] = `Input W (${W_input.toFixed(2)}) was ASD-level, converted to Strength-level W=${W_strength.toFixed(2)} for LRFD formulas.`;
            S_strength = null; // Not used in 7-16 formulas
            W_nominal = null; // Not used in 7-16 formulas

        } else { // ASCE 7-22: Formulas expect strength S and nominal W
            W_nominal = W_input; // Input is nominal, use directly for ASD formulas. For LRFD, it will be factored.
            S_strength = (level === 'Nominal (Service/ASD)') ? S_input * 1.6 : S_input; // Convert nominal snow to LRFD level
            if (level === 'Nominal (Service/ASD)' && S_input !== 0) adjustment_notes['S'] = `Input S (${S_input.toFixed(2)}) was Nominal, converted to Strength-level S=${S_strength.toFixed(2)} for LRFD formulas.`;
        }

        const formulas = {
            'ASCE 7-16': {
                'LRFD': {
                    '1. 1.4D': (d) => 1.4 * d.D, // Eq. 2.3.2-1
                    '2. 1.2D + 1.6L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.6 * d.L + 0.5 * Math.max(d.Lr, d.S_nominal, d.R), // Eq. 2.3.2-2
                    '3. 1.2D + 1.6(Lr|S|R) + (L|0.5W)': (d) => 1.2 * d.D + 1.6 * Math.max(d.Lr, d.S_nominal, d.R) + Math.max(d.L, 0.5 * d.W_strength), // Eq. 2.3.2-3
                    '4. 1.2D + 1.0W + L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.0 * d.W_strength + d.L + 0.5 * Math.max(d.Lr, d.S_nominal, d.R), // Eq. 2.3.2-4
                    '5. 1.2D + 1.0E + L + 0.2S': (d) => 1.2 * d.D + 1.0 * d.E + d.L + 0.2 * d.S_nominal, // Eq. 2.3.2-5
                    '6. 0.9D + 1.0W': (d) => 0.9 * d.D + 1.0 * d.W_strength, // Eq. 2.3.2-6
                    '7. 0.9D + 1.0E': (d) => 0.9 * d.D + 1.0 * d.E, // Eq. 2.3.2-7
                },
                'ASD': {
                    '1. D': (d) => d.D, // Eq. 2.4-1
                    '2. D + L': (d) => d.D + d.L, // Eq. 2.4-2
                    '3. D + (Lr|S|R)': (d) => d.D + Math.max(d.Lr, d.S_nominal, d.R), // Eq. 2.4-3
                    '4. D + 0.75L + 0.75(Lr|S|R)': (d) => d.D + 0.75 * d.L + 0.75 * Math.max(d.Lr, d.S_nominal, d.R), // Eq. 2.4-4
                    '5. D + 0.6W': (d) => d.D + 0.6 * d.W_strength, // Eq. 2.4-5, W is strength level
                    '6. D + 0.75L + 0.75(0.6W) + 0.75(Lr|S|R)': (d) => d.D + 0.75 * d.L + 0.75 * (0.6 * d.W_strength) + 0.75 * Math.max(d.Lr, d.S_nominal, d.R), // Eq. 2.4-6
                    '7. D + 0.7E': (d) => d.D + 0.7 * d.E, // Eq. 2.4-7
                    '8. D + 0.75L + 0.75(0.7E) + 0.75S': (d) => d.D + 0.75 * d.L + 0.75 * (0.7 * d.E) + 0.75 * d.S_nominal, // Eq. 2.4-8
                    '9. 0.6D + 0.6W': (d) => 0.6 * d.D + 0.6 * d.W_strength, // Eq. 2.4-9
                    '10. 0.6D + 0.7E': (d) => 0.6 * d.D + 0.7 * d.E, // Eq. 2.4-10
                }
            },
            'ASCE 7-22': {
                'LRFD': {
                    '1. 1.4D': (d) => 1.4 * d.D, // Eq. 2.3.1-1
                    '2. 1.2D + 1.6L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.6 * d.L + 0.5 * Math.max(d.Lr, d.S_strength, d.R), // Eq. 2.3.1-2, S is strength
                    '3a. 1.2D + 1.6(Lr|R) + (L|0.5W)': (d) => 1.2 * d.D + 1.6 * Math.max(d.Lr, d.R) + Math.max(d.L, 0.5 * d.W_nominal), // Eq. 2.3.1-3a
                    '3b. 1.2D + 1.0S + (L|0.5W)': (d) => 1.2 * d.D + 1.0 * d.S_strength + Math.max(d.L, 0.5 * d.W_nominal), // Eq. 2.3.1-3b
                    '4. 1.2D + 1.6W + L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.6 * d.W_nominal + d.L + 0.5 * Math.max(d.Lr, d.S_strength, d.R), // Eq. 2.3.1-4
                    '5. 1.2D + 1.0E + L + 1.0S': (d) => 1.2 * d.D + 1.0 * d.E + d.L + 1.0 * d.S_strength, // Eq. 2.3.1-5
                    '6. 0.9D + 1.6W': (d) => 0.9 * d.D + 1.6 * d.W_nominal, // Eq. 2.3.1-6
                    '7. 0.9D + 1.0E': (d) => 0.9 * d.D + 1.0 * d.E, // Eq. 2.3.1-7
                },
                'ASD': {
                    '1. D': (d) => d.D, // Eq. 2.4.1-1
                    '2. D + L': (d) => d.D + d.L, // Eq. 2.4.1-2
                    '3. D + (Lr|0.7S|R)': (d) => d.D + Math.max(d.Lr, 0.7 * d.S_strength, d.R), // Eq. 2.4.1-3, S is strength
                    '4. D + 0.75L + 0.75(Lr|0.7S|R)': (d) => d.D + 0.75 * d.L + 0.75 * Math.max(d.Lr, 0.7 * d.S_strength, d.R), // Eq. 2.4.1-4
                    '5. D + W': (d) => d.D + d.W_nominal, // Eq. 2.4.1-5, W is nominal
                    '6. D + 0.75L + 0.75W + 0.75(Lr|0.7S|R)': (d) => d.D + 0.75 * d.L + 0.75 * d.W_nominal + 0.75 * Math.max(d.Lr, 0.7 * d.S_strength, d.R), // Eq. 2.4.1-6
                    '7. D + 0.7E': (d) => d.D + 0.7 * d.E, // Eq. 2.4.1-7
                    '8. D + 0.75L + 0.75(0.7E) + 0.75(0.7S)': (d) => d.D + 0.75 * d.L + 0.75 * (0.7 * d.E) + 0.75 * (0.7 * d.S_strength), // Eq. 2.4.1-8
                    '9. 0.6D + W': (d) => 0.6 * d.D + d.W_nominal, // Eq. 2.4.1-9
                    '10. 0.6D + 0.7E': (d) => 0.6 * d.D + 0.7 * d.E, // Eq. 2.4.1-10
                }
            }
        };

        const selectedFormulas = formulas[standard][method];
        
        let results = {};
        let pattern_results = {};

        // Check for pattern live load requirement
        const live_load_threshold = unit_system === 'imperial' ? 100 : 4.79;
        const pattern_load_required = L > live_load_threshold;
        
        const evaluateCombinations = (formulas, data) => {
            const calculated = {};
            for (const key in formulas) calculated[key] = formulas[key](data);
            return calculated;
        };
        
        const scope = { D, L, Lr, R, E, S_nominal, W_strength, S_strength, W_nominal };

        results = evaluateCombinations(selectedFormulas, scope);
        if (pattern_load_required) {
            const pattern_scope = { ...scope, L: 0.75 * L };
            pattern_results = evaluateCombinations(selectedFormulas, pattern_scope);
        }

        return { results, pattern_results, pattern_load_required, final_formulas: selectedFormulas, adjustment_notes };
    }
    return { calculate: calculateCombinations };
})();

function handleRunComboCalculation() {
    const inputs = {};
    comboInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const key = id.replace('combo_', '');
            if (el.type === 'number') inputs[key] = parseFloat(el.value) || 0;
            else inputs[key] = el.value;
        }
    });

    const validation = validateInputs(inputs, validationRules.combo);
    if (validation.errors.length > 0) {
        renderValidationResults(validation, document.getElementById('combo-results-container'));
        return;
    }

    setLoadingState(true, 'run-combo-calculation-btn'); // Assumes setLoadingState is in shared-utils.js
    const fullResults = safeCalculation(() => {
        const effective_standard = inputs.jurisdiction === "NYCBC 2022" ? "ASCE 7-16" : inputs.asce_standard;
        
        // Define scenarios for different members and load cases
        const scenarios = {
            // Wind on walls
            windward_wall: { title: 'Windward Wall Analysis', S: inputs.balanced_snow_load_sb, W_max: inputs.wind_wall_ww_max, W_min: inputs.wind_wall_ww_min },
            leeward_wall: { title: 'Leeward Wall Analysis', S: inputs.unbalanced_windward_snow_load_suw, W_max: inputs.wind_wall_lw_max, W_min: inputs.wind_wall_lw_min },
            
            // Wind on roof
            windward_roof: { title: 'Windward Roof Analysis', S: inputs.unbalanced_windward_snow_load_suw, W_max: inputs.wind_roof_ww_max, W_min: inputs.wind_roof_ww_min },
            leeward_roof: { title: 'Leeward Roof Analysis', S: inputs.unbalanced_leeward_snow_load_sul, W_max: inputs.wind_roof_lw_max, W_min: inputs.wind_roof_lw_min },
            
            // C&C Loads (use balanced snow as it's a uniform load)
            cc_roof: { title: 'Components & Cladding (C&C) Roof Analysis', S: inputs.balanced_snow_load_sb, W_max: inputs.wind_cc_max, W_min: inputs.wind_cc_min }, // Renamed from 'cc'
            cc_wall: { title: 'Components & Cladding (C&C) Wall Analysis', S: inputs.balanced_snow_load_sb, W_max: inputs.wind_cc_wall_max, W_min: inputs.wind_cc_wall_min },
            
            // Other load cases
            balanced_snow: { title: 'Balanced Snow Load Analysis', S: inputs.balanced_snow_load_sb, W_max: 0, W_min: 0 },
            unbalanced_windward_snow: { title: 'Unbalanced Windward Snow Analysis', S: inputs.unbalanced_windward_snow_load_suw, W_max: 0, W_min: 0 },
            unbalanced_leeward_snow: { title: 'Unbalanced Leeward Snow Analysis', S: inputs.unbalanced_leeward_snow_load_sul, W_max: 0, W_min: 0 },
            drift_surcharge: { title: 'Drift Surcharge Load Analysis', S: inputs.balanced_snow_load_sb + inputs.drift_surcharge_sd, W_max: 0, W_min: 0 },
        };

        const base_combo_loads = { D: inputs.dead_load_d, L: inputs.live_load_l, Lr: inputs.roof_live_load_lr, R: inputs.rain_load_r, S: 0, W: 0, E: 0, unit_system: inputs.unit_system };
        const base_combos = comboLoadCalculator.calculate(base_combo_loads, effective_standard, inputs.input_load_level, inputs.design_method);

        const scenarios_data = {};
        for(const key in scenarios) {
            const { S, W_max, W_min } = scenarios[key];
            const base_loads = { D: inputs.dead_load_d, L: inputs.live_load_l, Lr: inputs.roof_live_load_lr, R: inputs.rain_load_r, S, E: inputs.seismic_load_e, unit_system: inputs.unit_system };
            scenarios_data[`${key}_wmax`] = comboLoadCalculator.calculate({ ...base_loads, W: W_max }, effective_standard, inputs.input_load_level, inputs.design_method);
            scenarios_data[`${key}_wmin`] = comboLoadCalculator.calculate({ ...base_loads, W: W_min }, effective_standard, inputs.input_load_level, inputs.design_method);
        }
        return { inputs, scenarios_data, base_combos, success: true, warnings: validation.warnings };
    }, 'An unexpected error occurred during the load combination calculation.');

    if (fullResults.error) {
        setLoadingState(false, 'run-combo-calculation-btn');
        renderValidationResults({ errors: [fullResults.error] }, document.getElementById('combo-results-container'));
        return;
    }

    renderComboResults(fullResults);
    setLoadingState(false, 'run-combo-calculation-btn');
}

function generateComboSummary(all_gov_data, design_method, p_unit) {
    const scenarios = {};
    all_gov_data.forEach(d => {
        if (!scenarios[d.title]) {
            scenarios[d.title] = { max: { value: -Infinity }, min: { value: Infinity } };
        }
        if (d.value > scenarios[d.title].max.value) scenarios[d.title].max = d;
        if (d.value < scenarios[d.title].min.value) scenarios[d.title].min = d;
    });

    let summaryHtml = `<div class="mt-8 report-section-copyable">
        <h3 class="text-xl font-bold uppercase">B. Governing Load Combinations Summary</h3>
        <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">`;

    summaryHtml += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">`;

    const scenarioOrder = [
        'Balanced Snow Analysis', 'Unbalanced Leeward Snow Analysis', 'Unbalanced Windward Snow Analysis', 'Drift Surcharge Analysis',
        'Windward Wall Analysis', 'Leeward Wall Analysis', 'Windward Roof Analysis', 'Leeward Roof Analysis',
        'Components & Cladding (C&C) Roof Analysis', 'Components & Cladding (C&C) Wall Analysis'
    ];

    scenarioOrder.forEach(title => {
        const data = scenarios[title];
        if (!data) return;

        const shortTitle = title.replace(' Analysis', '').replace(' Combinations', '');
        summaryHtml += `
            <div class="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 flex flex-col">
                <h4 class="font-semibold text-center text-base mb-2">${shortTitle}</h4>
                <div class="flex-grow space-y-2">
                    <div class="text-center">
                        <p class="text-sm">Max Pressure</p>
                        <p class="font-bold text-xl">${data.max.value.toFixed(2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate" title="${data.max.combo}">From: ${data.max.combo}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-sm">Max Uplift/Suction</p>
                        <p class="font-bold text-xl">${data.min.value.toFixed(2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate" title="${data.min.combo}">From: ${data.min.combo}</p>
                    </div>
                </div>
            </div>`;
    });

    summaryHtml += `</div>`; // Close grid

    const overallMax = all_gov_data.reduce((max, d) => (d.value > max.value ? d : max), { value: -Infinity });
    const overallMin = all_gov_data.reduce((min, d) => (d.value < min.value ? d : min), { value: Infinity });

    summaryHtml += `
        <div class="mt-8">
            <h3 class="text-xl font-bold uppercase">C. Overall Governing ${design_method} Loads</h3>
            <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
            <h4 class="font-semibold">1. FINAL GOVERNING ${design_method} LOADS</h4>
            <ul class="list-disc list-inside ml-4 space-y-1">
                <li><strong>Overall Max Pressure:</strong> ${overallMax.value.toFixed(2)} ${p_unit}
                    <div class="pl-6 text-sm text-gray-500 dark:text-gray-400">From: ${overallMax.title.replace(' Analysis', '')}: ${overallMax.combo}</div>
                </li>
                <li><strong>Overall Max Uplift/Suction:</strong> ${overallMin.value.toFixed(2)} ${p_unit}
                    <div class="pl-6 text-sm text-gray-500 dark:text-gray-400">From: ${overallMin.title.replace(' Analysis', '')}: ${overallMin.combo}</div>
                </li>
            </ul>
        </div>`;

    return summaryHtml;
}

function renderComboResults(fullResults) {
    if (!fullResults || !fullResults.success) return;
    lastComboRunResults = fullResults;
    
    const resultsContainer = document.getElementById('combo-results-container');
    let html = `<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2">
                    <button id="copy-summary-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Copy Summary</button>
                    <button id="print-report-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm">Print Report</button>
                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
              </div>`;

    html += `
                 <div class="text-center border-b pb-4">
                    <h2 class="text-2xl font-bold">LOAD COMBINATION REPORT (${fullResults.inputs.asce_standard})</h2>
                 </div>`;
    
    if (fullResults.warnings && fullResults.warnings.length > 0) {
        html += renderValidationResults({ warnings: fullResults.warnings, errors: [] });
    }

    // --- 1. INPUT LOADS ---
    const { inputs } = fullResults;
    const p_unit = inputs.unit_system === 'imperial' ? 'psf' : 'kPa';
    const input_loads = [
        { label: 'Dead Load (D)', value: inputs.dead_load_d },
        { label: 'Live Load (L)', value: inputs.live_load_l },
        { label: 'Roof Live (Lr)', value: inputs.roof_live_load_lr },
        { label: 'Rain Load (R)', value: inputs.rain_load_r },
        { label: 'Balanced Snow (Sb)', value: inputs.balanced_snow_load_sb },
        { label: 'Unbalanced Windward (Suw)', value: inputs.unbalanced_windward_snow_load_suw },
        { label: 'Unbalanced Leeward (Sul)', value: inputs.unbalanced_leeward_snow_load_sul },
        { label: 'Drift Surcharge (Sd)', value: inputs.drift_surcharge_sd },
        { label: 'Max Wind (Wmax)', value: Math.max(inputs.wind_wall_ww_max, inputs.wind_wall_lw_max, inputs.wind_roof_ww_max, inputs.wind_roof_lw_max, inputs.wind_cc_max, inputs.wind_cc_wall_max) },
        { label: 'Min Wind (Wmin)', value: Math.min(inputs.wind_wall_ww_min, inputs.wind_wall_lw_min, inputs.wind_roof_ww_min, inputs.wind_roof_lw_min, inputs.wind_cc_min, inputs.wind_cc_wall_min) },
        // Wind Loads (MWFRS)
        { label: 'Windward Wall Max (W)', value: inputs.wind_wall_ww_max },
        { label: 'Windward Wall Min (W)', value: inputs.wind_wall_ww_min },
        { label: 'Leeward Wall Max (W)', value: inputs.wind_wall_lw_max },
        { label: 'Leeward Wall Min (W)', value: inputs.wind_wall_lw_min },
        { label: 'Windward Roof Max (W)', value: inputs.wind_roof_ww_max },
        { label: 'Windward Roof Min (W)', value: inputs.wind_roof_ww_min },
        { label: 'Leeward Roof Max (W)', value: inputs.wind_roof_lw_max },
        { label: 'Leeward Roof Min (W)', value: inputs.wind_roof_lw_min },
        // Wind Loads (C&C)
        { label: 'C&C Roof Max/Min (W)', value: `${inputs.wind_cc_max.toFixed(2)} / ${inputs.wind_cc_min.toFixed(2)}` },
        { label: 'C&C Wall Max/Min (W)', value: `${inputs.wind_cc_wall_max.toFixed(2)} / ${inputs.wind_cc_wall_min.toFixed(2)}` },
        { label: 'Seismic Load (E)', value: inputs.seismic_load_e }
    ];

    html += `<div class="mt-6 report-section-copyable">
                <h3 class="text-xl font-bold uppercase">1. Input Loads</h3>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <ul class="list-disc list-inside space-y-1">`;
    
    input_loads.forEach(load => {
        if (typeof load.value === 'number') {
            html += `<li><strong>${load.label}:</strong> ${load.value.toFixed(2)} ${p_unit}</li>`;
        } else {
            // Handle cases where the value is already a formatted string (e.g., C&C loads)
            html += `<li><strong>${load.label}:</strong> ${load.value} ${p_unit}</li>`;
        }
    });

    html += `   </ul>
             </div>`;

    // --- Base Load Combinations (No Wind/Snow) ---
    html += `<h3 class="text-xl font-semibold text-center mt-6">Base Load Combinations</h3>
             <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-2">These combinations are constant across all scenarios.</p>
             <table class="results-container w-full mt-2 border-collapse">
                <thead><tr><th>Combination</th><th>Formula</th><th>Result</th></tr></thead>
                <tbody>`;
    for (const combo in fullResults.base_combos.results) {
        if (combo.includes('W') || combo.includes('S') || combo.includes('E')) continue;
        const formula = fullResults.base_combos.final_formulas[combo].toString().replace(/d\./g, '');
        const value = fullResults.base_combos.results[combo];
        html += `<tr><td>${combo}</td><td>${formula.replace(/Math\.max/g, 'max').replace(/Math\.min/g, 'min')}</td><td>${value.toFixed(2)}</td></tr>`;
    }
    html += `</tbody></table>`;


    // --- Scenario-Specific Combinations ---
    let all_gov_data = [];
    for (const key in fullResults.scenarios_data) {
        if (key.endsWith('_wmin')) continue; // Process pairs together
        const scenario_key = key.replace('_wmax', '');
        const title_map = {
            'windward_wall': 'Windward Wall Analysis', 
            'leeward_wall': 'Leeward Wall Analysis', 
            'windward_roof': 'Windward Roof Analysis', 
            'leeward_roof': 'Leeward Roof Analysis',
            'cc_roof': 'Components & Cladding (C&C) Roof Analysis',
            'cc_wall': 'Components & Cladding (C&C) Wall Analysis',
            'balanced_snow': 'Balanced Snow Analysis',
            'unbalanced_windward_snow': 'Unbalanced Windward Snow Analysis',
            'unbalanced_leeward_snow': 'Unbalanced Leeward Snow Analysis',
            'drift_surcharge': 'Drift Surcharge Analysis',
        };
        const title = title_map[scenario_key] || scenario_key;

         const res_wmax = fullResults.scenarios_data[`${scenario_key}_wmax`];
         const res_wmin = fullResults.scenarios_data[`${scenario_key}_wmin`];
         const pattern_load_required = res_wmax.pattern_load_required;
         
         if(!res_wmax) continue;

         html += `<h3 class="text-xl font-semibold text-center mt-8">${title}</h3>`;
         html += `<table class="results-container w-full mt-2 border-collapse">
                    <thead><tr><th>Combination</th><th>Formula</th><th>Result (Max Wind)</th><th>Result (Min Wind)</th></tr></thead>
                    <tbody>`;
        
        for (const combo in res_wmax.results) {
             if (!combo.includes('W') && !combo.includes('S') && !combo.includes('E')) continue; // Skip base combos
             const formula = res_wmax.final_formulas[combo].toString().replace(/d\./g, '');
             const val_wmax = res_wmax.results[combo];
             const val_wmin = res_wmin.results[combo];
             const rowId = `row-${scenario_key}-${combo.replace(/\s/g, '-')}`;
             all_gov_data.push({ value: val_wmax, combo, title });
             all_gov_data.push({ value: val_wmin, combo, title });

             html += `<tr id="${rowId}">
                        <td>${combo}</td>
                        <td>${formula.replace(/Math\.max/g, 'max').replace(/Math\.min/g, 'min')}</td>
                        <td>${val_wmax.toFixed(2)}</td>
                        <td>${val_wmin.toFixed(2)}</td>
                      </tr>`;
        }
         html += `</tbody></table>`;

        if (pattern_load_required) {
            html += `<h4 class="text-lg font-semibold text-center mt-4">Pattern Live Load Combinations (0.75L)</h4>`;
            html += `<p class="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">Required because Live Load > ${fullResults.inputs.unit_system === 'imperial' ? '100 psf' : '4.79 kPa'} (ASCE 7-16/22 Sec. 4.3.5)</p>`;
            html += `<table class="results-container w-full mt-2 border-collapse">
                    <thead><tr><th>Combination</th><th>Formula (with 0.75L)</th><th>Result (Max Wind)</th><th>Result (Min Wind)</th></tr></thead>
                    <tbody>`;
            for (const combo in res_wmax.pattern_results) {
                if (!combo.includes('W') && !combo.includes('S') && !combo.includes('E')) continue;
                const formula = res_wmax.final_formulas[combo].toString().replace(/d\./g, '');
                const val_wmax = res_wmax.pattern_results[combo];
                const val_wmin = res_wmin.pattern_results[combo];
                const rowId = `row-pattern-${scenario_key}-${combo.replace(/\s/g, '-')}`;
                all_gov_data.push({ value: val_wmax, combo, title, pattern: true });
                all_gov_data.push({ value: val_wmin, combo, title, pattern: true });
                html += `<tr id="${rowId}">
                            <td>${combo}</td>
                            <td>${formula.replace(/Math\.max/g, 'max').replace(/Math\.min/g, 'min')}</td>
                            <td>${val_wmax.toFixed(2)}</td>
                            <td>${val_wmin.toFixed(2)}</td>
                         </tr>`;
            }
            html += `</tbody></table>`;
        }
    }

    html += generateComboSummary(all_gov_data, fullResults.inputs.design_method, p_unit);

    html += `</div>`;
    resultsContainer.innerHTML = html;
}

function handleSaveComboInputs() { // This function is not used in the provided HTML, but keeping it for consistency
    const inputs = gatherInputsFromIds(comboInputIds);
    saveInputsToFile(inputs, 'combo-inputs.txt');
    showFeedback('Load combo inputs saved to combo-inputs.txt', false, 'feedback-message');
}

function handleLoadComboInputs(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const inputs = JSON.parse(e.target.result);
            comboInputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && inputs[id] !== undefined) {
                    if (el.type === 'checkbox') el.checked = inputs[id];
                    else el.value = inputs[id];
                }
            });
            showFeedback('Load combo inputs loaded successfully!', false, 'feedback-message');
            handleRunComboCalculation();
        } catch (err) {
            showFeedback('Failed to load combo inputs. Data may be corrupt.', true, 'feedback-message');
            console.error("Error parsing saved data:", err);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}