document.addEventListener('DOMContentLoaded', () => {
    injectHeader({ activePage: 'wood-design', pageTitle: 'NDS Wood Member Design Checker', headerPlaceholderId: 'header-placeholder' });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });

    const runButton = document.getElementById('run-wood-check-btn');
    runButton.addEventListener('click', handleRunWoodCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    loadInputsFromLocalStorage('wood-design-inputs', inputIds, handleRunWoodCheck);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile());
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    initializeTheme();
    document.getElementById('wood-results-container').addEventListener('click', (event) => {
        if (event.target.id === 'copy-report-btn') handleCopyToClipboard('wood-report-content', 'feedback-message');
        
        if (event.target.id === 'download-pdf-btn') {
            handleDownloadPdf('wood-report-content', 'Wood-Design-Report.pdf');
        }
        const button = event.target.closest('.toggle-details-btn');
        if (button) {
            const detailId = button.dataset.toggleId;
            const detailRow = document.getElementById(detailId);
            detailRow?.classList.toggle('is-visible');
            button.textContent = detailRow?.classList.contains('is-visible') ? '[Hide]' : '[Show]';
        }

    });
});

function handleSaveInputs() {
    const inputs = gatherInputsFromIds(inputIds);
    saveInputsToFile(inputs, 'wood-inputs.txt');
    showFeedback('Inputs saved to wood-inputs.txt', false, 'feedback-message');
}

function handleLoadInputs(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const inputs = JSON.parse(e.target.result);
            inputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && inputs[id] !== undefined) {
                    el.value = inputs[id];
                }
            });
            handleRunWoodCheck();
        } catch (err) {
            console.error("Failed to load inputs:", err);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

const validationRules = {
    wood: {
        'Fb_unadjusted': { min: 0.001, required: true, label: 'Fb' },
        'Fv_unadjusted': { min: 0.001, required: true, label: 'Fv' },
        'Fc_unadjusted': { min: 0.001, required: true, label: 'Fc' },
        'E_unadjusted': { min: 0.001, required: true, label: 'E' },
        'E_min_unadjusted': { min: 0.001, required: true, label: 'E_min' },
        'b_width': { min: 0.001, required: true, label: 'Width (b)' },
        'd_depth': { min: 0.001, required: true, label: 'Depth (d)' },
        'unbraced_length_L': { min: 0.001, required: true, label: 'Unbraced Length (L)' },
        'effective_length_factor_K': { min: 0.001, required: true, label: 'K Factor' },
    }
};

const inputIds = [
    'Fb_unadjusted', 'Fv_unadjusted', 'Fc_perp_unadjusted', 'Fc_unadjusted', 'E_unadjusted', 'E_min_unadjusted',
    'b_width', 'd_depth', 'unbraced_length_L', 'effective_length_factor_K', 'bearing_length_Lb',
    'load_duration', 'wet_service', 'temperature', 'flat_use', 'incising', 'repetitive_member', 'deflection_span', 'deflection_limit',
    'axial_load_P', 'moment_load_M', 'shear_load_V'
];


function handleRunWoodCheck() {
    const inputs = gatherInputsFromIds(inputIds);
    const validation = validateInputs(inputs, validationRules.wood);
    if (validation.errors.length > 0) {
        renderValidationResults(validation, document.getElementById('wood-results-container'));
        return;
    }

    saveInputsToLocalStorage('wood-design-inputs', inputs);
    const wood_results = woodChecker.run(inputs);
    renderWoodResults(wood_results, inputs);
}

function gatherInputs() {
    const getVal = (id) => parseFloat(document.getElementById(id).value) || 0;
    const getStr = (id) => document.getElementById(id).value;
    
    return {
        Fb: getVal('Fb_unadjusted'), Fv: getVal('Fv_unadjusted'), Fc_perp: getVal('Fc_perp_unadjusted'),
        Fc: getVal('Fc_unadjusted'), E: getVal('E_unadjusted'), E_min: getVal('E_min_unadjusted'), // Base values
        b: getVal('b_width'), d: getVal('d_depth'), Lu: getVal('unbraced_length_L') * 12, K: getVal('effective_length_factor_K'), Lb: getVal('bearing_length_Lb'), // Geometry
        // Factors
        CD: getVal('load_duration'),
        is_wet: getStr('wet_service').includes('Wet'),
        temp_cond: getStr('temperature'),
        is_weak_axis: getStr('flat_use').includes('Weak'), // Bending Axis
        is_incised: getStr('incising').includes('Yes'),
        is_repetitive: getStr('repetitive_member').includes('Yes'),
        P: getVal('axial_load_P') * 1000, 
        M: getVal('moment_load_M') * 1000 * 12, // Convert kip-ft to lb-in
        deflection_span: getVal('deflection_span') * 12, // Convert ft to in
        deflection_limit_divisor: getVal('deflection_limit'),
        V: getVal('shear_load_V') * 1000
    };
}

const woodChecker = (() => {
    function calculate_all_factors(inputs) {
        const factors = {};
        const { is_wet, temp_cond, Fb, Fc, b, d, is_incised, is_repetitive, Lb, CD } = inputs;

        factors.CD = CD;
        factors.CM_Fb = is_wet && Fb > 1150 ? 0.85 : 1.0;
        factors.CM_Fv = is_wet ? 0.97 : 1.0;
        factors.CM_Fc_perp = is_wet ? 0.67 : 1.0;
        factors.CM_Fc = is_wet && Fc > 750 ? 0.8 : 1.0;
        factors.CM_E = is_wet ? 0.9 : 1.0;
        factors.CM_E_min = is_wet ? 0.9 : 1.0;

        if (temp_cond === 'low') factors.Ct = 1.0;
        else if (temp_cond === 'medium') factors.Ct = 0.8;
        else if (temp_cond === 'high') factors.Ct = 0.7;
        else factors.Ct = 1.0;

        if (d > 12) factors.CF = Math.pow((12 / d), 1/9);
        else if (d > 4) factors.CF = 1.0;
        else factors.CF = b >= 4 ? 1.1 : 1.5;

        factors.Cfu = 1.0; // Simplified
        factors.Ci = is_incised ? 0.8 : 1.0;
        factors.Cr = is_repetitive ? 1.15 : 1.0;
        factors.Cb = (Lb > 0 && Lb < 6) ? (Lb + 0.375) / Lb : 1.0;
        factors.CL = 1.0;
        factors.Cp = 1.0;
        return factors;
    }

    function run(inputs) {
        const results = {};
        const factors = calculate_all_factors(inputs);

        const E_min_prime = inputs.E_min * factors.CM_E_min * factors.Ct * factors.Ci;
        const Fc_star = inputs.Fc * factors.CD * factors.CM_Fc * factors.Ct * factors.CF * factors.Ci;
        results.Fc_star = Fc_star;

        const Le = inputs.Lu * inputs.K;
        const d_col = inputs.d;
        const Le_d = d_col > 0 ? Le / d_col : 0;
        results.Le_d = Le_d;
        results.slenderness_fail_column = false;

        if (Le_d <= 50) {
            const c = 0.8;
            const Fce = Le_d > 0 ? (0.822 * E_min_prime) / (Le_d**2) : Infinity;
            const ratio_cp = Fc_star > 0 ? Fce / Fc_star : 0;
            factors.Cp = ratio_cp > 0 ? ((1 + ratio_cp) / (2 * c)) - Math.sqrt(((1 + ratio_cp) / (2 * c))**2 - (ratio_cp / c)) : 0;
            results.Fce = Fce;
        } else {
            factors.Cp = 0;
            results.Fce = 0;
            results.slenderness_fail_column = true;
        }

        const [b_beam, d_beam] = inputs.is_weak_axis ? [inputs.d, inputs.b] : [inputs.b, inputs.d];
        const Rb = b_beam > 0 ? Math.sqrt(inputs.Lu * d_beam / b_beam**2) : 0;
        results.Rb = Rb;
        results.slenderness_fail_beam = false;

        if (Rb <= 50) {
            const Fb_star = inputs.Fb * factors.CD * factors.CM_Fb * factors.Ct * factors.CF * factors.Cfu * factors.Ci * factors.Cr;
            results.Fb_star = Fb_star;
            const FbE = Rb > 0 ? (1.20 * E_min_prime) / (Rb**2) : Infinity;
            const ratio_cl = Fb_star > 0 ? FbE / Fb_star : 0;
            factors.CL = ratio_cl > 0 ? Math.min(1.0, ((1 + ratio_cl) / 1.9) - Math.sqrt(((1 + ratio_cl) / 1.9)**2 - (ratio_cl / 0.95))) : 0;
            results.FbE = FbE;
        } else {
            factors.CL = 0;
            results.FbE = 0;
            results.Fb_star = 0;
            results.slenderness_fail_beam = true;
        }

        const adj = {};
        adj.Fb_prime = inputs.Fb * factors.CD * factors.CM_Fb * factors.Ct * factors.CL * factors.CF * factors.Cfu * factors.Ci * factors.Cr;
        adj.Fv_prime = inputs.Fv * factors.CD * factors.CM_Fv * factors.Ct * factors.Ci;
        adj.Fc_perp_prime = inputs.Fc_perp * factors.CM_Fc_perp * factors.Ct * factors.Ci * factors.Cb;
        adj.Fc_prime = Fc_star * factors.Cp;
        results.adjusted = adj;
        results.factors = factors;
        results.E_min_prime = E_min_prime;

        const A = inputs.b * inputs.d;
        const Sx = (b_beam * d_beam**2) / 6;
        const actual = {};
        actual.fb = inputs.M * 12 / Sx;
        actual.fv = (1.5 * inputs.V) / A;
        actual.fc = inputs.P / A;
        actual.A = A;
        actual.Sx = Sx;
        results.actuals = actual;
        
        // Deflection Calculation (assuming simply supported beam with uniform load)
        const I = (b_beam * Math.pow(d_beam, 3)) / 12;
        const E_adj = inputs.E * factors.CM_E * factors.Ct * factors.Ci;
        const actual_deflection = (E_adj > 0 && I > 0) ? (5 * inputs.M * Math.pow(inputs.deflection_span, 2)) / (48 * E_adj * I) : Infinity;
        const allowable_deflection = inputs.deflection_limit_divisor > 0 ? inputs.deflection_span / inputs.deflection_limit_divisor : Infinity;
        results.deflection = {
            actual: actual_deflection,
            allowable: allowable_deflection,
            E_adj: E_adj
        };

        const denominator_safe = adj.Fc_prime > 0 && adj.Fb_prime > 0 && results.Fce > 0 && actual.fc < results.Fce;
        if (denominator_safe) {
            results.interaction = Math.pow(actual.fc / adj.Fc_prime, 2) + (actual.fb / (adj.Fb_prime * (1 - (actual.fc/results.Fce))));
        } else {
            results.interaction = Infinity;
        }

        return results;
    }

    return { run };
})();

function renderWoodResults(wood_results, inputs) {
    const resultsContainer = document.getElementById('wood-results-container');

    // Early exit if there are errors, preventing crashes.
    if (wood_results.errors && wood_results.errors.length > 0) {
        resultsContainer.innerHTML = `
            <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md my-4">
                <p class="font-bold">Input Errors Found:</p>
                <ul class="list-disc list-inside mt-2">${wood_results.errors.map(e => `<li>${e}</li>`).join('')}</ul>
                <p class="mt-2">Please correct the errors and run the check again.</p>
            </div>`;
        return;
    }

    let html = `<div id="wood-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2">
                <button id="copy-summary-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm print-hidden">Copy Summary</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm print-hidden">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm print-hidden">Copy Report</button>
             </div>`;
    html += `<h2 class="report-header text-center">NDS Wood Member Check Summary</h2>`;
    
    const adj = wood_results.adjusted;
    const actual = wood_results.actuals;
    const interaction = wood_results.interaction;
    const deflection = wood_results.deflection;

    const fb_ratio = adj.Fb_prime > 0 ? actual.fb / adj.Fb_prime : Infinity;
    const fv_ratio = adj.Fv_prime > 0 ? actual.fv / adj.Fv_prime : Infinity; 
    const fc_ratio = adj.Fc_prime > 0 ? actual.fc / adj.Fc_prime : Infinity;
    const deflection_ratio = deflection.allowable > 0 ? deflection.actual / deflection.allowable : Infinity;

    const summary_data = [
        {
            name: 'Flexure (Bending)',
            actual: `${actual.fb.toFixed(2)} psi`,
            allowable: `${adj.Fb_prime.toFixed(2)} psi`,
            ratio: fb_ratio.toFixed(3),
            status: fb_ratio <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `<h4>Flexure Breakdown</h4>
                <ul>
                    <li>Actual Bending Stress (f<sub>b</sub>) = M / S<sub>x</sub> = ${inputs.M.toFixed(0)} lb-in / ${actual.Sx.toFixed(3)} in³ = <b>${actual.fb.toFixed(2)} psi</b></li>
                    <li>Allowable Bending Stress (F'<sub>b</sub>) = F<sub>b</sub> * C<sub>D</sub> * C<sub>M</sub> * C<sub>t</sub> * C<sub>L</sub> * C<sub>F</sub> * C<sub>i</sub> * C<sub>r</sub></li>
                    <li>F'<sub>b</sub> = ${inputs.Fb} * ${wood_results.factors.CD.toFixed(2)} * ${wood_results.factors.CM_Fb.toFixed(2)} * ${wood_results.factors.Ct.toFixed(2)} * ${wood_results.factors.CL.toFixed(3)} * ${wood_results.factors.CF.toFixed(3)} * ${wood_results.factors.Ci.toFixed(2)} * ${wood_results.factors.Cr.toFixed(2)} = <b>${adj.Fb_prime.toFixed(2)} psi</b></li>
                    <li>Beam Stability Factor (C<sub>L</sub>) = <b>${wood_results.factors.CL.toFixed(3)}</b> (from R<sub>B</sub> = ${wood_results.Rb.toFixed(2)})</li>
                </ul>`
        },
        {
            name: 'Shear',
            actual: `${actual.fv.toFixed(2)} psi`,
            allowable: `${adj.Fv_prime.toFixed(2)} psi`,
            ratio: fv_ratio.toFixed(3),
            status: fv_ratio <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `<h4>Shear Breakdown</h4>
                <ul>
                    <li>Actual Shear Stress (f<sub>v</sub>) = 1.5 * V / A = 1.5 * ${inputs.V.toFixed(0)} lb / ${actual.A.toFixed(3)} in² = <b>${actual.fv.toFixed(2)} psi</b></li>
                    <li>Allowable Shear Stress (F'<sub>v</sub>) = F<sub>v</sub> * C<sub>D</sub> * C<sub>M</sub> * C<sub>t</sub> * C<sub>i</sub></li>
                    <li>F'<sub>v</sub> = ${inputs.Fv} * ${wood_results.factors.CD.toFixed(2)} * ${wood_results.factors.CM_Fv.toFixed(2)} * ${wood_results.factors.Ct.toFixed(2)} * ${wood_results.factors.Ci.toFixed(2)} = <b>${adj.Fv_prime.toFixed(2)} psi</b></li>
                </ul>`
        },
        {
            name: 'Compression',
            actual: `${actual.fc.toFixed(2)} psi`,
            allowable: `${adj.Fc_prime.toFixed(2)} psi`,
            ratio: fc_ratio.toFixed(3),
            status: fc_ratio <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `<h4>Compression Breakdown</h4>
                <ul>
                    <li>Actual Compression Stress (f<sub>c</sub>) = P / A = ${inputs.P.toFixed(0)} lb / ${actual.A.toFixed(3)} in² = <b>${actual.fc.toFixed(2)} psi</b></li>
                    <li>Allowable Compression Stress (F'<sub>c</sub>) = F<sub>c</sub>* * C<sub>P</sub> = ${wood_results.Fc_star.toFixed(2)} psi * ${wood_results.factors.Cp.toFixed(3)} = <b>${adj.Fc_prime.toFixed(2)} psi</b></li>
                    <li>Column Stability Factor (C<sub>P</sub>) = <b>${wood_results.factors.Cp.toFixed(3)}</b> (from L<sub>e</sub>/d = ${wood_results.Le_d.toFixed(2)})</li>
                </ul>`
        },
        {
            name: 'Deflection',
            actual: `${deflection.actual.toFixed(3)} in`,
            allowable: `${deflection.allowable.toFixed(3)} in (L/${inputs.deflection_limit_divisor})`,
            ratio: deflection_ratio.toFixed(3),
            status: deflection_ratio <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `<h4>Deflection Breakdown</h4>
                <ul>
                    <li>Allowable Deflection = Span / ${inputs.deflection_limit_divisor} = ${inputs.deflection_span.toFixed(2)} in / ${inputs.deflection_limit_divisor} = <b>${deflection.allowable.toFixed(3)} in</b></li>
                    <li>Actual Deflection (δ) = 5*M*L² / (48*E'*I) = (5 * ${inputs.M.toFixed(0)} * ${inputs.deflection_span.toFixed(2)}²) / (48 * ${deflection.E_adj.toExponential(2)} * ${(actual.Sx * inputs.d / 2).toFixed(2)}) = <b>${deflection.actual.toFixed(3)} in</b></li>
                </ul>`
        },
        {
            name: 'Combined Bending + Axial',
            actual: `Eq. ${inputs.is_weak_axis ? '3.9-2' : '3.9-3'}`,
            allowable: "1.00",
            ratio: interaction.toFixed(3),
            status: interaction <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `<h4>Combined Stress Interaction Breakdown</h4>
                <ul>
                    <li>Equation: (f<sub>c</sub> / F'<sub>c</sub>)² + f<sub>b</sub> / (F'<sub>b</sub> * (1 - f<sub>c</sub>/F<sub>cE</sub>))</li>
                    <li>Interaction = (${actual.fc.toFixed(2)} / ${adj.Fc_prime.toFixed(2)})² + ${actual.fb.toFixed(2)} / (${adj.Fb_prime.toFixed(2)} * (1 - ${actual.fc.toFixed(2)}/${wood_results.Fce.toFixed(2)})) = <b>${interaction.toFixed(3)}</b></li>
                </ul>`
        }
    ];

    const f = wood_results.factors;
    const factor_data = [
        ['Load Duration (C<sub>D</sub>)', f.CD.toFixed(2), 'NDS 2.3.2'],
        ['Wet Service (C<sub>M</sub>)', `${f.CM_Fb.toFixed(2)} (Fb), ${f.CM_Fv.toFixed(2)} (Fv), ${f.CM_Fc.toFixed(2)} (Fc)`, 'NDS Table 4.3.1'],
        ['Temperature (C<sub>t</sub>)', f.Ct.toFixed(2), 'NDS 2.3.3'],
        ['Size Factor (C<sub>F</sub>)', f.CF.toFixed(3), 'NDS 4.3.6'],
        ['Incising (C<sub>i</sub>)', f.Ci.toFixed(2), 'NDS 4.3.8'],
        ['Repetitive Member (C<sub>r</sub>)', f.Cr.toFixed(2), 'NDS 4.3.9'],
        ['Bearing Area (C<sub>b</sub>)', f.Cb.toFixed(3), 'NDS 3.10.4'],
        ['Beam Stability (C<sub>L</sub>)', f.CL.toFixed(3), 'NDS 3.3.3'],
        ['Column Stability (C<sub>P</sub>)', f.Cp.toFixed(3), 'NDS 3.7.1'],
    ];

    html += `<table class="results-container mt-6 report-section-copyable">
                <caption>--- NDS Adjustment Factors ---</caption>
                <thead>
                    <tr><th>Factor</th><th>Value</th><th>Reference</th></tr>
                </thead>
                <tbody>`;
    factor_data.forEach(row => {
        html += `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`;
    });
    html += `</tbody></table>`;

    html += `<table class="results-container report-section-copyable">
                <caption>--- Strength Checks (ASD) ---</caption>
                <thead>
                    <tr><th>Check</th><th>Actual</th><th>Allowable</th><th>Ratio</th><th>Status</th></tr>
                </thead>
                <tbody>`;
    summary_data.forEach((row, index) => {
        const statusClass = row.status === 'Pass' ? 'pass' : 'fail';
        const detailId = `wood-detail-${index}`;
        html += `<tr>
                    <td>${row.name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${row.actual}</td><td>${row.allowable}</td><td>${row.ratio}</td><td class="${statusClass}">${row.status}</td>
                 </tr>
                 <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${row.breakdown}</div></td></tr>`;
    });
    html += `</tbody></table></div>`;

    resultsContainer.innerHTML = html;
}