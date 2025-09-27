const aciInputIds = [
    'fc', 'fy', 'b', 'h', 'cover', 'num_bars', 'bar_size',
    'stirrup_size', 'stirrup_legs', 'stirrup_spacing', 'Mu', 'Vu'
];

const BAR_AREAS = { 3: 0.11, 4: 0.20, 5: 0.31, 6: 0.44, 7: 0.60, 8: 0.79, 9: 1.00, 10: 1.27, 11: 1.56 };

const aciCalculator = (() => {
    function calculate(inputs) {
        const i = { ...inputs };
        // Convert to base units (lbs, inches)
        i.Mu = i.Mu * 12000;
        i.Vu = i.Vu * 1000;

        const res = {};
        const Es = 29000000; // psi

        // --- Flexure Calculation (ACI 318-19 Ch. 9 & 22) ---
        const stirrup_dia = BAR_AREAS[i.stirrup_size] ? i.stirrup_size / 8 : 0;
        const bar_dia = BAR_AREAS[i.bar_size] ? i.bar_size / 8 : 0;
        const d = i.h - i.cover - stirrup_dia - (bar_dia / 2);
        const As = i.num_bars * (BAR_AREAS[i.bar_size] || 0);
        const beta1 = Math.max(0.65, Math.min(0.85, 0.85 - 0.05 * ((i.fc - 4000) / 1000)));
        const a = (As * i.fy) / (0.85 * i.fc * i.b);
        const c = a / beta1;
        const strain_t = c > 0 ? (d - c) / c * 0.003 : Infinity;
        const phi_f = strain_t >= 0.005 ? 0.90 : (strain_t > (i.fy / Es) ? 0.65 + 0.25 * ((strain_t - (i.fy / Es)) / (0.005 - (i.fy / Es))) : 0.65);
        const Mn = As * i.fy * (d - a / 2);
        res.phiMn = phi_f * Mn;
        res.flexure_details = { d, As, a, c, strain_t, phi_f, Mn };

        // --- Shear Calculation (ACI 318-19 Ch. 22) ---
        const Av = i.stirrup_legs * (BAR_AREAS[i.stirrup_size] || 0);
        const Vc = 2 * Math.sqrt(i.fc) * i.b * d;
        const Vs = (Av * i.fy * d) / i.stirrup_spacing;
        const Vs_max = 8 * Math.sqrt(i.fc) * i.b * d;
        const phi_v = 0.75;
        res.phiVn = phi_v * (Vc + Math.min(Vs, Vs_max));
        res.shear_details = { Vc, Vs, Vs_max, Av, phi_v };

        return { inputs: i, results: res };
    }

    return { calculate };
})();

function renderAciResults(calc_results) {
    const { inputs, results } = calc_results;
    const summaryContainer = document.getElementById('summary-results');
    const resultsContainer = document.getElementById('results-container');

    const M_ratio = results.phiMn > 0 ? inputs.Mu / results.phiMn : Infinity;
    const V_ratio = results.phiVn > 0 ? inputs.Vu / results.phiVn : Infinity;
    const getStatus = (ratio) => ratio <= 1.0 ? `<span class="pass">OK</span>` : `<span class="fail">FAIL</span>`;

    summaryContainer.innerHTML = `
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Flexure (M<sub>u</sub> / &phi;M<sub>n</sub>):</span> <strong class="${M_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${M_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Shear (V<sub>u</sub> / &phi;V<sub>n</sub>):</span> <strong class="${V_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${V_ratio.toFixed(3)}</strong></p>
        </div>
    `;

    resultsContainer.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 class="text-2xl font-bold text-center border-b pb-2">Detailed Calculation Report (ACI 318-19)</h2>
            <table class="w-full mt-4">
                <caption>Design Checks</caption>
                <thead><tr><th>Check</th><th>Demand</th><th>Capacity</th><th>Ratio</th><th>Status</th></tr></thead>
                <tbody>
                    <tr>
                        <td>Flexure</td>
                        <td>${(inputs.Mu / 12000).toFixed(2)} kip-ft</td>
                        <td>${(results.phiMn / 12000).toFixed(2)} kip-ft</td>
                        <td>${M_ratio.toFixed(3)}</td>
                        <td>${getStatus(M_ratio)}</td>
                    </tr>
                    <tr>
                        <td>Shear</td>
                        <td>${(inputs.Vu / 1000).toFixed(2)} kips</td>
                        <td>${(results.phiVn / 1000).toFixed(2)} kips</td>
                        <td>${V_ratio.toFixed(3)}</td>
                        <td>${getStatus(V_ratio)}</td>
                    </tr>
                </tbody>
            </table>
            <div class="calc-breakdown mt-4">
                <h4>Flexure Breakdown</h4>
                <ul>
                    <li>Effective Depth (d) = h - cover - d<sub>stirrup</sub> - d<sub>bar</sub>/2 = <b>${results.flexure_details.d.toFixed(2)} in</b></li>
                    <li>Area of Steel (A<sub>s</sub>) = n * A<sub>bar</sub> = ${inputs.num_bars} * ${BAR_AREAS[inputs.bar_size]} = <b>${results.flexure_details.As.toFixed(2)} in²</b></li>
                    <li>Depth of Compression Block (a) = (A<sub>s</sub> * f<sub>y</sub>) / (0.85 * f'<sub>c</sub> * b) = <b>${results.flexure_details.a.toFixed(2)} in</b></li>
                    <li>Neutral Axis Depth (c) = a / &beta;<sub>1</sub> = ${results.flexure_details.a.toFixed(2)} / ${results.flexure_details.beta1.toFixed(2)} = <b>${results.flexure_details.c.toFixed(2)} in</b></li>
                    <li>Tensile Strain (&epsilon;<sub>t</sub>) = 0.003 * (d - c) / c = <b>${results.flexure_details.strain_t.toFixed(4)}</b> (${results.flexure_details.strain_t >= 0.005 ? 'Tension-Controlled' : 'Transition'})</li>
                    <li>Strength Reduction Factor (&phi;<sub>f</sub>) = <b>${results.flexure_details.phi_f.toFixed(2)}</b> <span class="ref">[ACI 21.2.2]</span></li>
                    <li>Nominal Moment (M<sub>n</sub>) = A<sub>s</sub> * f<sub>y</sub> * (d - a/2) = <b>${(results.flexure_details.Mn / 12000).toFixed(2)} kip-ft</b></li>
                </ul>
            </div>
            <div class="calc-breakdown mt-4">
                <h4>Shear Breakdown</h4>
                <ul>
                    <li>Concrete Capacity (V<sub>c</sub>) = 2 * &radic;(f'<sub>c</sub>) * b * d = <b>${(results.shear_details.Vc/1000).toFixed(2)} kips</b> <span class="ref">[ACI 22.5.5.1]</span></li>
                    <li>Stirrup Capacity (V<sub>s</sub>) = (A<sub>v</sub> * f<sub>y</sub> * d) / s = <b>${(results.shear_details.Vs/1000).toFixed(2)} kips</b> <span class="ref">[ACI 22.5.10.5.3]</span></li>
                    <li>Max Stirrup Capacity (V<sub>s,max</sub>) = 8 * &radic;(f'<sub>c</sub>) * b * d = <b>${(results.shear_details.Vs_max/1000).toFixed(2)} kips</b> <span class="ref">[ACI 22.5.1.2]</span></li>
                    <li>Nominal Shear (V<sub>n</sub>) = V<sub>c</sub> + min(V<sub>s</sub>, V<sub>s,max</sub>) = <b>${((results.shear_details.Vc + Math.min(results.shear_details.Vs, results.shear_details.Vs_max))/1000).toFixed(2)} kips</b></li>
                </ul>
            </div>
        </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const handleRunAciCheck = createCalculationHandler({
        inputIds: aciInputIds,
        storageKey: 'aci-concrete-inputs',
        validationRuleKey: 'aci_concrete',
        calculatorFunction: aciCalculator.calculate,
        renderFunction: renderAciResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });
    injectHeader({ activePage: 'aci-concrete', pageTitle: 'ACI 318-19 Concrete Beam Checker', headerPlaceholderId: 'header-placeholder' });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    loadInputsFromLocalStorage('aci-concrete-inputs', aciInputIds);
    
    const handleSaveInputs = createSaveInputsHandler(aciInputIds, 'aci-concrete-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(aciInputIds);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    document.getElementById('run-check-btn').addEventListener('click', handleRunAciCheck);
});