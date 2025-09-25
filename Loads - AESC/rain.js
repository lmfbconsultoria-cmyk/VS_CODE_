let lastRainRunResults = null;

const rainInputIds = [
    'rain_asce_standard', 'rain_unit_system', 'rain_design_method', 'rain_jurisdiction', 'rain_tributary_area',
    'rain_intensity', 'rain_static_head', 'rain_hydraulic_head', 'dh_auto_calc_toggle', 'rain_drain_type', 'rain_scupper_width', 'rain_drain_diameter'
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
        document.getElementById('run-rain-calculation-btn').addEventListener('click', handleRunRainCalculation);
        document.getElementById('save-rain-inputs-btn').addEventListener('click', handleSaveRainInputs);
        document.getElementById('load-rain-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('rain-file-input'));
        document.getElementById('rain-file-input').addEventListener('change', handleLoadRainInputs);

        attachDebouncedListeners(rainInputIds, handleRunRainCalculation);

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
        
        document.getElementById('rain_city_selector').addEventListener('change', (event) => {
            const intensity = event.target.value;
            if (intensity) {
                document.getElementById('rain_intensity').value = intensity;
            }
        });

        document.getElementById('dh_auto_calc_toggle').addEventListener('change', (event) => {
            const isAuto = event.target.checked;
            document.getElementById('dh_auto_calc_container').classList.toggle('hidden', !isAuto);
            document.getElementById('dh_manual_input_container').classList.toggle('hidden', isAuto);
        });

        document.getElementById('rain_drain_type').addEventListener('change', (event) => {
            const drainType = event.target.value;
            document.getElementById('scupper_inputs').classList.toggle('hidden', drainType !== 'scupper');
            document.getElementById('drain_inputs').classList.toggle('hidden', drainType !== 'drain');
        });

        // Trigger change events on load to set initial visibility
        document.getElementById('dh_auto_calc_toggle').dispatchEvent(new Event('change'));
        document.getElementById('rain_drain_type').dispatchEvent(new Event('change'));

        document.body.addEventListener('click', (event) => {
            if (event.target.id === 'copy-report-btn') {
                handleCopyToClipboard('rain-results-container', 'feedback-message');
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
        });
    }

    initializeApp();
});

const validationRules = {
    rain: {
        'tributary_area': { min: 0, required: true, label: 'Tributary Area' },
        'intensity': { min: 0, required: true, label: 'Rainfall Intensity' }
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

const rainLoadCalculator = (() => {
    function run(inputs) {
        let { static_head: ds, hydraulic_head: dh, intensity: i, tributary_area: A, unit_system, jurisdiction, dh_auto_calc, drain_type, scupper_width, drain_diameter } = inputs;
        let dh_calc_note = "";
        const warnings = [];

        if (dh_auto_calc) {
            // Per IPC, Q (gpm) = 0.0104 * A (sqft) * i (in/hr)
            const Q_gpm = 0.0104 * A * i;
            
            if (drain_type === 'scupper') {
                // Weir formula: Q_gpm = 213 * L_in * (dh_in)^(1.5)
                // Solved for dh: dh_in = (Q_gpm / (213 * L_in))^(2/3)
                if (scupper_width > 0) {
                    dh = Math.pow(Q_gpm / (213 * scupper_width), 2/3);
                    dh_calc_note = `d_h calculated from Q = ${Q_gpm.toFixed(1)} gpm and a ${scupper_width}-in wide scupper.`;
                } else {
                    dh = 0;
                    dh_calc_note = "Scupper width must be > 0 to calculate d_h.";
                }
            } else { // drain
                // Orifice formula: Q_gpm = 24.5 * d_in^2 * sqrt(dh_in)
                // Solved for dh: dh_in = (Q_gpm / (24.5 * d_in^2))^2
                if (drain_diameter > 0) {
                    dh = Math.pow(Q_gpm / (24.5 * Math.pow(drain_diameter, 2)), 2);
                    dh_calc_note = `d_h calculated from Q = ${Q_gpm.toFixed(1)} gpm and a ${drain_diameter}-in diameter drain.`;
                } else {
                    dh = 0;
                    dh_calc_note = "Drain diameter must be > 0 to calculate d_h.";
                }
            }
        }

        if (dh > ds) {
            warnings.push(`The calculated hydraulic head (d_h = ${dh.toFixed(2)}) is greater than the static head (d_s = ${ds.toFixed(2)}). This indicates the secondary drainage system may be undersized for the given rainfall intensity and could lead to ponding instability. Review drainage design.`);
        }

        const R_nominal = (unit_system === 'imperial') ? 5.2 * (ds + dh) : 0.0098 * (ds + dh);
        const jurisdiction_note = (jurisdiction === "NYCBC 2022") ? "NYCBC 2022 adopts ASCE 7-16 for rain loads. Note: The hydraulic head (dh) must be based on the 100-year hourly rainfall rate of 4 in/hr as per the NYC Plumbing Code." : "";

        return {
            inputs,
            results: {
                R_nominal, dh_final: dh,
                R_strength: 1.6 * R_nominal,
                R_asd: 1.0 * R_nominal
            },
            jurisdiction_note,
            dh_calc_note,
            warnings,
            success: true
        };
    }
    return { run };
})();

function handleRunRainCalculation() {
    const rawInputs = gatherInputsFromIds(rainInputIds);
    
    // Sanitize and map inputs to a clean object, preventing NaN issues
    const inputs = {
        tributary_area: Math.max(0, rawInputs.rain_tributary_area),
        intensity: Math.max(0, rawInputs.rain_intensity),
        static_head: Math.max(0, rawInputs.rain_static_head),
        hydraulic_head: Math.max(0, rawInputs.rain_hydraulic_head),
        scupper_width: Math.max(0, rawInputs.rain_scupper_width),
        drain_diameter: Math.max(0, rawInputs.rain_drain_diameter),
        dh_auto_calc: rawInputs.dh_auto_calc_toggle,
        asce_standard: rawInputs.rain_asce_standard,
        unit_system: rawInputs.rain_unit_system,
        design_method: rawInputs.rain_design_method,
        jurisdiction: rawInputs.rain_jurisdiction,
        drain_type: rawInputs.rain_drain_type
    };
    
    const validation = validateInputs(inputs, 'rain');
    if (validation.errors.length > 0) {
        renderValidationResults(validation, document.getElementById('rain-results-container'));
        return;
    }

    setLoadingState(true, 'run-rain-calculation-btn'); // Assumes setLoadingState is in shared-utils.js
    const results = safeCalculation(
        () => rainLoadCalculator.run(inputs),
        'An unexpected error occurred during the rain calculation.'
    );
    if (results.error) {
        setLoadingState(false, 'run-rain-calculation-btn');
        renderValidationResults({ errors: [results.error] }, document.getElementById('rain-results-container'));
        return;
    }
    renderRainResults(results);
    setLoadingState(false, 'run-rain-calculation-btn');
}

function generateRainSummary(inputs, results, p_unit, dh_calc_note) {
    const { R_strength, R_asd } = results;
    const finalLoad = (inputs.design_method === 'ASD') ? R_asd : R_strength;
    const noteHtml = dh_calc_note ? `<p class="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">${dh_calc_note}</p>` : '';

    return `<div class="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                <h3 class="text-xl font-semibold text-center mb-4">Governing Load Summary (${inputs.design_method})</h3>
                <div class="text-center">
                    <p class="text-4xl font-bold">${finalLoad.toFixed(2)} <span class="text-2xl font-medium">${p_unit}</span></p>
                    ${noteHtml}
                </div>
            </div>`;
}

function renderRainResults(results) {
    if (!results || !results.success) return;
    lastRainRunResults = results;
    const resultsContainer = document.getElementById('rain-results-container');
    const { inputs, jurisdiction_note, dh_calc_note, warnings } = results;
    const { R_nominal, R_strength, R_asd, dh_final } = results.results;
    const p_unit = inputs.unit_system === 'imperial' ? 'psf' : 'kPa';
    const d_unit = inputs.unit_system === 'imperial' ? 'in' : 'mm';
    const i_unit = inputs.unit_system === 'imperial' ? 'in/hr' : 'mm/hr';
    const a_unit = inputs.unit_system === 'imperial' ? 'ft²' : 'm²';
    const factor = inputs.unit_system === 'imperial' ? '5.2' : '0.0098';

    let html = `<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2">
                    <button id="print-report-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm">Print Report</button>
                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
              </div>`;

    html += `
        <div class="text-center border-b pb-4">
            <h2 class="text-2xl font-bold">RAIN LOAD CALCULATION REPORT (${inputs.asce_standard})</h2>
        </div>`;

    if (jurisdiction_note) {
        html += `<div class="bg-blue-100 dark:bg-blue-900/50 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-4 rounded-md"><p><strong>Jurisdiction Note:</strong> ${jurisdiction_note}</p></div>`;
    }
    if (warnings && warnings.length > 0) {
        html += renderValidationResults({ warnings, errors: [] });
    }
    
    const finalLoad = (inputs.design_method === 'ASD') ? R_asd : R_strength;

    // --- Design Parameters Summary ---
    html += `<div class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-6">
                <h3 class="text-xl font-semibold text-center mb-4">Design Parameters</h3>
                <ul class="summary-list">
                    <li><strong>Tributary Area (A):</strong> ${inputs.tributary_area.toFixed(0)} ${a_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>
                    <li><strong>Rainfall Intensity (i):</strong> ${inputs.intensity.toFixed(2)} ${i_unit} <span class="ref">[Plumbing Code / ASCE 7, C8.3]</span></li>
                    <li><strong>Static Head (d<sub>s</sub>):</strong> ${inputs.static_head.toFixed(2)} ${d_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>
                    <li><strong>Hydraulic Head (d<sub>h</sub>):</strong> ${dh_final.toFixed(2)} ${d_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>_
                    ${inputs.dh_auto_calc ? `<li><span class="pl-4 text-sm text-gray-500 dark:text-gray-400">&hookrightarrow; ${dh_calc_note}</span></li>` : ''}
                    <li><strong>Nominal Rain Load (R):</strong> ${R_nominal.toFixed(2)} ${p_unit} <span class="ref">[ASCE 7, Eq. 8.3-1]</span></li>
                </ul>
             </div>`;

    html += generateRainSummary(inputs, results.results, p_unit, dh_calc_note);
    html += `<div class="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 space-y-4 mt-6">
            <h3 class="text-xl font-semibold text-center mb-4">Calculation Breakdown</h3><ul class="space-y-2">
                <li><strong>Formula (ASCE 7 Eq 8.3-1):</strong> R = ${factor} * (d<sub>s</sub> + d<sub>h</sub>)</li>
                <li><strong>Static Head (d<sub>s</sub>):</strong> ${inputs.static_head.toFixed(2)} ${d_unit}</li>
                ${inputs.dh_auto_calc ? `
                    <li><strong>Hydraulic Head (d<sub>h</sub>) Calculation:</strong>
                        <ul class="list-disc list-inside pl-4 text-sm">
                            <li>Rainfall Intensity (i): ${inputs.intensity.toFixed(2)} ${i_unit}</li>
                            <li>Tributary Area (A): ${sanitizeHTML(inputs.tributary_area.toFixed(0))} ${a_unit}</li>
                            ${dh_calc_note ? `<li>${dh_calc_note}</li>` : ''}
                            <li>Calculated d<sub>h</sub> = <b>${dh_final.toFixed(2)} ${d_unit}</b></li>
                        </ul>
                    </li>
                ` : `<li><strong>Hydraulic Head (d<sub>h</sub>):</strong> ${dh_final.toFixed(2)} ${d_unit}</li>`}
                <li><strong>Nominal Load (R):</strong> R = ${factor} * (${inputs.static_head.toFixed(2)} + ${dh_final.toFixed(2)}) = <b>${R_nominal.toFixed(2)} ${p_unit}</b></li>
            </ul>
            <hr class="dark:border-gray-600 my-4">
             <p><strong>Strength Design Load (LRFD):</strong> 1.6 * ${R_nominal.toFixed(2)} = <strong>${R_strength.toFixed(2)} ${p_unit}</strong></p>
             <p><strong>Allowable Stress Design Load (ASD):</strong> 1.0 * ${R_nominal.toFixed(2)} = <strong>${R_asd.toFixed(2)} ${p_unit}</strong></p>
        </div>
     </div>`;

    resultsContainer.innerHTML = html;
}

function handleSaveRainInputs() {
    const inputs = gatherInputsFromIds(rainInputIds);
    saveInputsToFile(inputs, 'rain-inputs.txt');
    showFeedback('Rain inputs saved to rain-inputs.txt', false, 'feedback-message');
}

function handleLoadRainInputs(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const inputs = JSON.parse(e.target.result);
            rainInputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && inputs[id] !== undefined) {
                    if (el.type === 'checkbox') el.checked = inputs[id];
                    else el.value = inputs[id];
                }
            });
            showFeedback('Rain inputs loaded successfully!', false, 'feedback-message');
            handleRunRainCalculation();
        } catch (err) {
            showFeedback('Failed to load rain inputs. Data may be corrupt.', true, 'feedback-message');
            console.error("Error parsing saved data:", err);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}