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
        const handleSaveRainInputs = createSaveInputsHandler(rainInputIds, 'rain-inputs.txt');
        const handleLoadRainInputs = createLoadInputsHandler(rainInputIds, handleRunRainCalculation);

        document.getElementById('run-rain-calculation-btn').addEventListener('click', handleRunRainCalculation);
        document.getElementById('save-rain-inputs-btn').addEventListener('click', handleSaveRainInputs);
        document.getElementById('load-rain-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('rain-file-input')); // initiateLoad is already generic
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

        document.body.addEventListener('click', async (event) => {
            const copyBtn = event.target.closest('.copy-section-btn');
            if (copyBtn) {
                const targetId = copyBtn.dataset.copyTargetId;
                if (targetId) {
                    await handleCopyToClipboard(targetId, 'feedback-message');
                }
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            if (event.target.id === 'send-to-combos-btn' && lastRainRunResults) {
                sendRainToCombos(lastRainRunResults);
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
    
    const validation = validateInputs(inputs, validationRules.rain);
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

    let html = `<div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6 report-section-copyable">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                    <button id="send-to-combos-btn" class="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 text-sm">Send to Combos</button>
                    <button id="print-report-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm">Print Report</button>
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
    html += `<div id="rain-params-section" class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-semibold text-center flex-grow">Design Parameters</h3>
                    <button data-copy-target-id="rain-params-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs print-hidden">Copy Section</button>
                </div>
                <ul class="summary-list">
                    <li><strong>Tributary Area (A):</strong> ${inputs.tributary_area.toFixed(0)} ${a_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>
                    <li><strong>Rainfall Intensity (i):</strong> ${inputs.intensity.toFixed(2)} ${i_unit} <span class="ref">[Plumbing Code / ASCE 7, C8.3]</span></li>
                    <li><strong>Static Head (d<sub>s</sub>):</strong> ${inputs.static_head.toFixed(2)} ${d_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>
                    <li><strong>Hydraulic Head (d<sub>h</sub>):</strong> ${dh_final.toFixed(2)} ${d_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>_
                    ${inputs.dh_auto_calc ? `<li><span class="pl-4 text-sm text-gray-500 dark:text-gray-400">&hookrightarrow; ${dh_calc_note}</span></li>` : ''}
                    <li><strong>Nominal Rain Load (R):</strong> ${R_nominal.toFixed(2)} ${p_unit} <span class="ref">[ASCE 7, Eq. 8.3-1]</span></li>
                </ul>
             </div>`;

    html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
             <div id="rain-summary-section">
                ${generateRainSummary(inputs, results.results, p_unit, dh_calc_note)}
             </div>
             <div id="rain-breakdown-section" class="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 space-y-4">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-semibold text-center flex-grow">Calculation Breakdown</h3>
                <button data-copy-target-id="rain-breakdown-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs print-hidden">Copy Section</button>
            </div>
            <ul class="space-y-2">
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
        </div>
     </div>`;

    resultsContainer.innerHTML = html;
}

function sendRainToCombos(results) {
    if (!results || !results.results) {
        showFeedback('No rain results to send.', true, 'feedback-message');
        return;
    }
    const comboData = {
        combo_rain_load_r: results.results.R_nominal || 0,
    };
    localStorage.setItem('loadsForCombinator', JSON.stringify(comboData));
    window.location.href = 'combos.html';
}