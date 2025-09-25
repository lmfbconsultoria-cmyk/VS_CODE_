let lastComboRunResults = null;

const comboInputIds = [
    'combo_asce_standard', 'combo_jurisdiction', 'combo_design_method', 'combo_input_load_level', 'combo_unit_system',
    'combo_dead_load_d', 'combo_live_load_l', 'combo_roof_live_load_lr', 'combo_rain_load_r', 'combo_balanced_snow_load_sb',
    'combo_unbalanced_windward_snow_load_suw', 'combo_unbalanced_leeward_snow_load_sul', 'combo_drift_surcharge_sd',
    'combo_maximum_wind_load_wmax', 'combo_minimum_wind_load_wmin', 'combo_seismic_load_e'
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

        document.body.addEventListener('click', (event) => {
            if (event.target.id === 'copy-report-btn') {
                handleCopyToClipboard('combo-results-container', 'feedback-message');
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
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
        'maximum_wind_load_wmax': { required: false, label: 'Max Wind (Wmax)' },
        'minimum_wind_load_wmin': { required: false, label: 'Min Wind (Wmin)' },
        'seismic_load_e': { required: false, label: 'Seismic Load (E)' }
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

const comboLoadCalculator = (() => {
    function calculateCombinations(loads, standard, level, method) {
        const { D, L, Lr, R, S: S_input, W: W_input, E, unit_system } = loads;
        const adjustment_notes = {};

        let S, W; // These will be the values used in the formulas

        // LRFD formulas use strength-level loads. ASD formulas use nominal-level loads.
        // We adjust inputs to the required level for the formulas.
        if (standard === "ASCE 7-16") { // Formulas expect nominal S and strength W
            S = S_input; // Input is nominal, use directly for ASD formulas. For LRFD, it will be factored.
            W = (level === 'Nominal (Service/ASD)') ? W_input / 0.6 : W_input; // Convert ASD wind to LRFD level
            if (level === 'Nominal (Service/ASD)' && W_input !== 0) adjustment_notes['W'] = `Input W (${W_input.toFixed(2)}) was ASD-level, converted to Strength-level W=${W.toFixed(2)} for LRFD formulas.`;

        } else { // ASCE 7-22: Formulas expect strength S and nominal W
            W = W_input; // Input is nominal, use directly for ASD formulas. For LRFD, it will be factored.
            S = (level === 'Nominal (Service/ASD)') ? S_input * 1.6 : S_input; // Convert nominal snow to LRFD level
            if (level === 'Nominal (Service/ASD)' && S_input !== 0) adjustment_notes['S'] = `Input S (${S_input.toFixed(2)}) was Nominal, converted to Strength-level S=${S.toFixed(2)} for LRFD formulas.`;
        }

        const formulas = {
            'ASCE 7-16': {
                'LRFD': {
                    '1. 1.4D': (d) => 1.4 * d.D,
                    '2. 1.2D + 1.6L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.6 * d.L + 0.5 * Math.max(d.Lr, d.S, d.R),
                    '3. 1.2D + 1.6(Lr|S|R) + (L|0.5W)': (d) => 1.2 * d.D + 1.6 * Math.max(d.Lr, d.S, d.R) + Math.max(d.L, 0.5 * d.W),
                    '4. 1.2D + 1.0W + L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.0 * d.W + d.L + 0.5 * Math.max(d.Lr, d.S, d.R),
                    '5. 1.2D + 1.0E + L + 0.2S': (d) => 1.2 * d.D + 1.0 * d.E + d.L + 0.2 * d.S,
                    '6. 0.9D + 1.0W': (d) => 0.9 * d.D + 1.0 * d.W,
                    '7. 0.9D + 1.0E': (d) => 0.9 * d.D + 1.0 * d.E,
                },
                'ASD': {
                    '1. D': (d) => d.D, '2. D + L': (d) => d.D + d.L, '3. D + (Lr|S|R)': (d) => d.D + Math.max(d.Lr, d.S, d.R),
                    '4. D + 0.75L + 0.75(Lr|S|R)': (d) => d.D + 0.75 * d.L + 0.75 * Math.max(d.Lr, d.S, d.R),
                    '5. D + 0.6W': (d) => d.D + 0.6 * W, // W is strength level
                    '6. D + 0.75L + 0.75(0.6W) + 0.75(Lr|S|R)': (d) => d.D + 0.75 * d.L + 0.75 * (0.6 * W) + 0.75 * Math.max(d.Lr, d.S, d.R),
                    '7. D + 0.7E': (d) => d.D + 0.7 * d.E,
                    '8. D + 0.75L + 0.75(0.7E) + 0.75S': (d) => d.D + 0.75 * d.L + 0.75 * (0.7 * d.E) + 0.75 * d.S,
                    '9. 0.6D + 0.6W': (d) => 0.6 * d.D + 0.6 * W,
                    '10. 0.6D + 0.7E': (d) => 0.6 * d.D + 0.7 * d.E,
                }
            },
            'ASCE 7-22': {
                'LRFD': {
                    '1. 1.4D': (d) => 1.4 * d.D,
                    '2. 1.2D + 1.6L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.6 * d.L + 0.5 * Math.max(d.Lr, S, d.R), // S is strength
                    '3a. 1.2D + 1.6(Lr|R) + (L|0.5W)': (d) => 1.2 * d.D + 1.6 * Math.max(d.Lr, d.R) + Math.max(d.L, 0.5 * d.W),
                    '3b. 1.2D + 1.0S + (L|0.5W)': (d) => 1.2 * d.D + 1.0 * S + Math.max(d.L, 0.5 * d.W),
                    '4. 1.2D + 1.6W + L + 0.5(Lr|S|R)': (d) => 1.2 * d.D + 1.6 * d.W + d.L + 0.5 * Math.max(d.Lr, S, d.R),
                    '5. 1.2D + 1.0E + L + 1.0S': (d) => 1.2 * d.D + 1.0 * d.E + d.L + 1.0 * S,
                    '6. 0.9D + 1.6W': (d) => 0.9 * d.D + 1.6 * d.W,
                    '7. 0.9D + 1.0E': (d) => 0.9 * d.D + 1.0 * d.E,
                },
                'ASD': {
                    '1. D': (d) => d.D, '2. D + L': (d) => d.D + d.L, '3. D + (Lr|0.7S|R)': (d) => d.D + Math.max(d.Lr, 0.7 * S, d.R), // S is strength
                    '4. D + 0.75L + 0.75(Lr|0.7S|R)': (d) => d.D + 0.75 * d.L + 0.75 * Math.max(d.Lr, 0.7 * S, d.R),
                    '5. D + W': (d) => d.D + d.W, // W is nominal
                    '6. D + 0.75L + 0.75W + 0.75(Lr|0.7S|R)': (d) => d.D + 0.75 * d.L + 0.75 * d.W + 0.75 * Math.max(d.Lr, 0.7 * S, d.R),
                    '7. D + 0.7E': (d) => d.D + 0.7 * d.E,
                    '8. D + 0.75L + 0.75(0.7E) + 0.75(0.7S)': (d) => d.D + 0.75 * d.L + 0.75 * (0.7 * d.E) + 0.75 * (0.7 * S),
                    '9. 0.6D + W': (d) => 0.6 * d.D + d.W,
                    '10. 0.6D + 0.7E': (d) => 0.6 * d.D + 0.7 * d.E,
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
        
        const scope = { D, L, Lr, R, S: S_input, W: W_input, E }; // Use original inputs for ASD
        if (method === 'LRFD') {
            Object.assign(scope, { S, W }); // Use adjusted S and W for LRFD
        }

        results = evaluateCombinations(selectedFormulas, scope);
        if (pattern_load_required) {
            const pattern_scope = { ...scope, L: 0.75 * L };
            pattern_results = evaluateCombinations(selectedFormulas, pattern_scope);
        }

        return { results, pattern_results, pattern_load_required, final_formulas: selectedFormulas, S, W, adjustment_notes };
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

    const validation = validateInputs(inputs, 'combo');
    if (validation.errors.length > 0) {
        renderValidationResults(validation, document.getElementById('combo-results-container'));
        return;
    }

    setLoadingState(true, 'run-combo-calculation-btn'); // Assumes setLoadingState is in shared-utils.js
    const fullResults = safeCalculation(() => {
        const effective_standard = inputs.jurisdiction === "NYCBC 2022" ? "ASCE 7-16" : inputs.asce_standard;
        const scenarios = {
            balanced: { title: 'Balanced Snow Load', S: inputs.balanced_snow_load_sb },
            unbalanced_leeward: { title: 'Unbalanced Leeward Snow', S: inputs.unbalanced_leeward_snow_load_sul },
            unbalanced_windward: { title: 'Unbalanced Windward Snow', S: inputs.unbalanced_windward_snow_load_suw },
            drift: { title: 'Drift Surcharge Load', S: inputs.balanced_snow_load_sb + inputs.drift_surcharge_sd }
        };

        const scenarios_data = {};
        for(const key in scenarios) {
            if (scenarios[key].S === 0 && key !== 'balanced') continue;
            const base_loads = { D: inputs.dead_load_d, L: inputs.live_load_l, Lr: inputs.roof_live_load_lr, R: inputs.rain_load_r, S: scenarios[key].S, E: inputs.seismic_load_e, unit_system: inputs.unit_system };
            scenarios_data[`${key}_wmax`] = comboLoadCalculator.calculate({ ...base_loads, W: inputs.maximum_wind_load_wmax }, effective_standard, inputs.input_load_level, inputs.design_method);
            scenarios_data[`${key}_wmin`] = comboLoadCalculator.calculate({ ...base_loads, W: inputs.minimum_wind_load_wmin }, effective_standard, inputs.input_load_level, inputs.design_method);
        }
        return { inputs, scenarios_data, success: true, warnings: validation.warnings };
    }, 'An unexpected error occurred during the load combination calculation.');

    if (fullResults.error) {
        setLoadingState(false, 'run-combo-calculation-btn');
        renderValidationResults({ errors: [fullResults.error] }, document.getElementById('combo-results-container'));
        return;
    }

    renderComboResults(fullResults);
    setLoadingState(false, 'run-combo-calculation-btn');
}

function generateComboSummary(all_gov_data, design_method) {
    const overallMax = Math.max(...all_gov_data.map(d => d.value).filter(v => !isNaN(v)));
    const overallMin = Math.min(...all_gov_data.map(d => d.value).filter(v => !isNaN(v)));

    const max_combo_data = all_gov_data.find(d => d.value === overallMax);
    const min_combo_data = all_gov_data.find(d => d.value === overallMin);

    return `<div class="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
            <h3 class="text-xl font-semibold text-center mb-4">Overall Governing Loads (${design_method})</h3>
            <div class="grid grid-cols-2 text-center">
                <div>
                    <p class="text-lg">Max Pressure / Downward</p><p class="text-3xl font-bold">${overallMax.toFixed(2)}</p><p class="text-xs text-gray-500 dark:text-gray-400">From Combo: ${max_combo_data?.combo || 'N/A'}</p>
                </div>
                 <div>
                    <p class="text-lg">Max Uplift / Suction</p><p class="text-3xl font-bold">${overallMin.toFixed(2)}</p><p class="text-xs text-gray-500 dark:text-gray-400">From Combo: ${min_combo_data?.combo || 'N/A'}</p>
                </div>
            </div>
        </div>`;
}

function renderComboResults(fullResults) {
    if (!fullResults || !fullResults.success) return;
    lastComboRunResults = fullResults;
    
    const resultsContainer = document.getElementById('combo-results-container');
    let html = `<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2">
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

    let all_gov_data = [];
    for (const key in fullResults.scenarios_data) {
        if (key.endsWith('_wmin')) continue;
        const scenario_key = key.replace('_wmax', '');
         const snow_scenarios = {'balanced': 'Balanced Snow Load', 'unbalanced_leeward': 'Unbalanced Leeward Snow', 'unbalanced_windward': 'Unbalanced Windward Snow', 'drift': 'Drift Surcharge Load'};
         const title = snow_scenarios[scenario_key];

         const res_wmax = fullResults.scenarios_data[`${scenario_key}_wmax`];
         const res_wmin = fullResults.scenarios_data[`${scenario_key}_wmin`];
         const pattern_load_required = res_wmax.pattern_load_required;
         
         if(!res_wmax) continue;

         html += `<h3 class="text-xl font-semibold text-center mt-6">${title}</h3>`;
         html += `<table class="results-container w-full mt-2 border-collapse">
                    <thead><tr><th>Combination</th><th>Formula</th><th>Result (Wmax)</th><th>Result (Wmin)</th></tr></thead>
                    <tbody>`;
        
        for (const combo in res_wmax.results) {
             const formula = res_wmax.final_formulas[combo].toString().replace(/d\./g, '');
             const val_wmax = res_wmax.results[combo];
             const val_wmin = res_wmin.results[combo];
             const rowId = `row-${scenario_key}-${combo.replace(/\s/g, '-')}`;
             all_gov_data.push({ value: val_wmax, combo, scenario: scenario_key, rowId, col: 'wmax' });
             all_gov_data.push({ value: val_wmin, combo, scenario: scenario_key, rowId, col: 'wmin' });

             html += `<tr id="${rowId}">
                        <td>${combo}</td>
                        <td>${formula.replace(/Math\.max/g, 'max').replace(/Math\.min/g, 'min')}</td>
                        <td data-col="wmax">${val_wmax.toFixed(2)}</td>
                        <td data-col="wmin">${val_wmin.toFixed(2)}</td>
                      </tr>`;
        }
         html += `</tbody></table>`;

        if (pattern_load_required) {
            html += `<h4 class="text-lg font-semibold text-center mt-4">Pattern Live Load Combinations (0.75L)</h4>`;
            html += `<p class="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">Required because Live Load > ${fullResults.inputs.unit_system === 'imperial' ? '100 psf' : '4.79 kPa'} (ASCE 7-16/22 Sec. 4.3.5)</p>`;
            html += `<table class="results-container w-full mt-2 border-collapse">
                    <thead><tr><th>Combination</th><th>Formula (with 0.75L)</th><th>Result (Wmax)</th><th>Result (Wmin)</th></tr></thead>
                    <tbody>`;
            for (const combo in res_wmax.pattern_results) {
                const formula = res_wmax.final_formulas[combo].toString().replace(/d\./g, '');
                const val_wmax = res_wmax.pattern_results[combo];
                const val_wmin = res_wmin.pattern_results[combo];
                const rowId = `row-pattern-${scenario_key}-${combo.replace(/\s/g, '-')}`;
                all_gov_data.push({ value: val_wmax, combo, scenario: scenario_key, rowId, col: 'wmax', pattern: true });
                all_gov_data.push({ value: val_wmin, combo, scenario: scenario_key, rowId, col: 'wmin', pattern: true });
                html += `<tr id="${rowId}">
                            <td>${combo}</td>
                            <td>${formula.replace(/Math\.max/g, 'max').replace(/Math\.min/g, 'min')}</td>
                            <td data-col="wmax">${val_wmax.toFixed(2)}</td>
                            <td data-col="wmin">${val_wmin.toFixed(2)}</td>
                         </tr>`;
            }
            html += `</tbody></table>`;
        }
    }

    html += generateComboSummary(all_gov_data, fullResults.inputs.design_method);

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