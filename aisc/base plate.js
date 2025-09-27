const basePlateInputIds = [
    'design_method', 'design_code', 'unit_system', 'base_plate_Fy', 'concrete_fc',
    'anchor_bolt_Fut', 'anchor_bolt_Fnv', 'weld_Fexx', 'base_plate_length_N',
    'base_plate_width_B', 'provided_plate_thickness_tp', 'column_depth_d',
    'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter',
    'anchor_embedment_hef', 'num_bolts_total', 'num_bolts_tension_row', 'bolt_spacing_N',
    'bolt_spacing_B', 'bolt_type', 'weld_size', 'axial_load_P_in', 'moment_M_in',
    'shear_V_in', 'assume_cracked_concrete'
];

function drawBaseplateDiagram() {
    const svg = document.getElementById('baseplate-diagram');
    if (!svg) return;
    svg.innerHTML = ''; // Clear previous drawing

    const getVal = id => parseFloat(document.getElementById(id).value) || 0;

    // Get inputs
    const N = getVal('base_plate_length_N');
    const B = getVal('base_plate_width_B');
    const d = getVal('column_depth_d');
    const bf = getVal('column_flange_width_bf');
    const bolt_spacing_N = getVal('bolt_spacing_N');
    const bolt_spacing_B = getVal('bolt_spacing_B');
    const bolt_dia = getVal('anchor_bolt_diameter');

    // Drawing parameters
    const W = 400, H = 300;
    const pad = 50;
    const total_w = B;
    const total_h = N;
    const scale = Math.min((W - 2 * pad) / total_w, (H - 2 * pad) / total_h);
    if (!isFinite(scale) || scale <= 0) return;

    const cx = W / 2;
    const cy = H / 2;

    const sN = N * scale;
    const sB = B * scale;
    const sd = d * scale;
    const sbf = bf * scale;
    const bolt_r = (bolt_dia * scale) / 2;

    const ns = "http://www.w3.org/2000/svg";
    const createEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    // Draw Plate
    svg.appendChild(createEl('rect', { x: cx - sB / 2, y: cy - sN / 2, width: sB, height: sN, class: 'svg-plate' }));
    // Draw Column
    svg.appendChild(createEl('rect', { x: cx - sbf / 2, y: cy - sd / 2, width: sbf, height: sd, class: 'svg-member' }));

    // Draw Bolts (assuming 4 bolts for simplicity, common case)
    const bolt_offset_B = (bolt_spacing_B * scale) / 2;
    const bolt_offset_N = (bolt_spacing_N * scale) / 2;
    svg.appendChild(createEl('circle', { cx: cx - bolt_offset_B, cy: cy - bolt_offset_N, r: bolt_r, class: 'svg-bolt' }));
    svg.appendChild(createEl('circle', { cx: cx + bolt_offset_B, cy: cy - bolt_offset_N, r: bolt_r, class: 'svg-bolt' }));
    svg.appendChild(createEl('circle', { cx: cx - bolt_offset_B, cy: cy + bolt_offset_N, r: bolt_r, class: 'svg-bolt' }));
    svg.appendChild(createEl('circle', { cx: cx + bolt_offset_B, cy: cy + bolt_offset_N, r: bolt_r, class: 'svg-bolt' }));

    // Draw Dimensions
    // Plate Width (B)
    const dim_y_top = cy - sN / 2 - 20;
    svg.appendChild(createEl('line', { x1: cx - sB / 2, y1: dim_y_top, x2: cx + sB / 2, y2: dim_y_top, class: 'svg-dim' }));
    svg.appendChild(createEl('text', { x: cx, y: dim_y_top - 5, class: 'svg-dim-text' })).textContent = `Plate B = ${B}"`;

    // Plate Length (N)
    const dim_x_left = cx - sB / 2 - 20;
    svg.appendChild(createEl('line', { x1: dim_x_left, y1: cy - sN / 2, x2: dim_x_left, y2: cy + sN / 2, class: 'svg-dim' }));
    svg.appendChild(createEl('text', { x: dim_x_left - 5, y: cy, class: 'svg-dim-text', transform: `rotate(-90 ${dim_x_left - 5},${cy})` })).textContent = `Plate N = ${N}"`;

    // Column Flange (bf)
    const dim_y_col = cy - sd / 2 - 10;
    svg.appendChild(createEl('line', { x1: cx - sbf / 2, y1: dim_y_col, x2: cx + sbf / 2, y2: dim_y_col, class: 'svg-dim' }));
    svg.appendChild(createEl('text', { x: cx, y: dim_y_col - 5, class: 'svg-dim-text' })).textContent = `bf = ${bf}"`;

    // Column Depth (d)
    const dim_x_col = cx - sbf / 2 - 10;
    svg.appendChild(createEl('line', { x1: dim_x_col, y1: cy - sd / 2, x2: dim_x_col, y2: cy + sd / 2, class: 'svg-dim' }));
    svg.appendChild(createEl('text', { x: dim_x_col - 5, y: cy, class: 'svg-dim-text', transform: `rotate(-90 ${dim_x_col - 5},${cy})` })).textContent = `d = ${d}"`;
}

const basePlateCalculator = (() => {
    const { PI, sqrt, min, max, abs } = Math;

    function run(inputs) {
        const {
            design_method, base_plate_length_N: N, base_plate_width_B: B, provided_plate_thickness_tp: tp,
            column_depth_d: d, column_flange_width_bf: bf, base_plate_Fy: Fy, concrete_fc: fc,
            axial_load_P_in: Pu, moment_M_in: Mu, shear_V_in: Vu,
            anchor_bolt_diameter: db, num_bolts_tension_row: n_bolts_tension, anchor_embedment_hef: hef,
            anchor_bolt_Fut: Fut, anchor_bolt_Fnv: Fnv
        } = inputs;

        const checks = {};

        // --- 1. Bearing Check (AISC DG1, 2nd Ed.) ---
        const e = (Mu * 12) / abs(Pu); // Eccentricity in inches
        const e_crit = N / 2 - abs(Pu) / (2 * 0.85 * fc * B);

        let f_p_max, Y, q_max;
        if (e <= N / 6) { // Case 1: Compression over entire plate
            f_p_max = (abs(Pu) / (B * N)) * (1 + (6 * e) / N);
        } else { // Case 2: Partial compression
            Y = N - 2 * e;
            f_p_max = (2 * abs(Pu)) / (B * Y);
        }

        // Concrete Bearing Strength (AISC J8)
        const phi_c = 0.65; // LRFD
        const omega_c = 2.31; // ASD
        const P_p = 0.85 * fc * B * N; // Assuming A2 is very large
        const design_bearing_strength = design_method === 'LRFD' ? phi_c * P_p : P_p / omega_c;
        const bearing_pressure_demand = f_p_max * B * (e <= N / 6 ? N : Y);

        checks['Concrete Bearing'] = {
            demand: bearing_pressure_demand,
            check: { Rn: P_p, phi: phi_c, omega: omega_c },
            details: { f_p_max, e, e_crit, Y, Pu, B, N, design_bearing_strength }
        };

        // --- 2. Plate Bending Check (AISC DG1) ---
        const m = (N - 0.95 * d) / 2;
        const n = (B - 0.80 * bf) / 2;
        const lambda = (2 * sqrt(f_p_max)) / (0.85 * fc);
        const n_prime = (sqrt(d * bf)) / 4;
        const X = ((4 * d * bf) / ((d + bf)**2)) * (abs(Pu) / design_bearing_strength);
        const l = max(m, n, lambda * n_prime);

        const t_req = l * sqrt((2 * f_p_max) / (0.9 * Fy));

        checks['Plate Bending'] = {
            demand: tp, // Provided thickness
            check: { Rn: t_req, phi: 1.0, omega: 1.0 }, // Use Rn as required thickness for ratio calc
            details: { m, n, l, t_req, f_p_max, Fy }
        };

        // --- 3. Anchor Bolt Tension (ACI 318-19 Ch. 17) ---
        let Tu_bolt = 0;
        if (Pu > 0) { // Uplift
            Tu_bolt = Pu / n_bolts_tension;
        } else if (e > N / 6) { // Moment causing tension
            const f = N / 2 - d / 2; // Approx. distance from plate center to tension bolts
            Tu_bolt = (Mu * 12 - abs(Pu) * (N / 2 - Y / 3)) / (f * n_bolts_tension);
        }

        if (Tu_bolt > 0) {
            const Ab = PI * (db ** 2) / 4.0;
            // Steel Strength of Anchor in Tension (ACI 17.6.1)
            const Nsa = Ab * Fut;
            checks['Anchor Steel Tension'] = { 
                demand: Tu_bolt, 
                check: { Rn: Nsa, phi: 0.75, omega: 2.00 },
                details: { Ab, Fut }
            };

            // Concrete Breakout Strength (ACI 17.6.2)
            const ANc = (1.5 * hef) * (1.5 * hef); // Simplified, assumes single anchor far from edges
            const ANco = 9 * hef * hef;
            const psi_ed_N = 1.0; // Simplified
            const psi_c_N = inputs.assume_cracked_concrete === 'true' ? 1.0 : 1.25;
            const psi_cp_N = 1.0; // Simplified
            const k_c = 24; // Cast-in
            const lambda_a = 1.0; // Normal weight concrete
            const Nb = k_c * lambda_a * sqrt(fc * 1000) * hef ** 1.5;
            const Ncb_group = (ANc / ANco) * psi_ed_N * psi_c_N * psi_cp_N * Nb;
            const Ncb = Ncb_group * n_bolts_tension; // Total for the group
            checks['Anchor Concrete Breakout'] = { 
                demand: Tu_bolt * n_bolts_tension, // Total demand on group
                check: { Rn: Ncb, phi: 0.65, omega: 2.31 },
                details: { Nb, Ncb_single: Ncb_group, ANc, ANco, psi_c_N, n_bolts_tension }
            };
        }

        // --- 4. Anchor Bolt Shear (ACI 318-19 Ch. 17) ---
        if (Vu > 0) {
            const Vu_bolt = Vu / inputs.num_bolts_total;
            const Ab = PI * (db ** 2) / 4.0;
            // Steel Strength of Anchor in Shear (ACI 17.7.1)
            const Vsa = 0.6 * Ab * Fut; // Assuming threads are NOT excluded
            checks['Anchor Steel Shear'] = { demand: Vu_bolt, check: { Rn: Vsa, phi: 0.65, omega: 2.31 }, details: { Ab, Fut } };
        }

        return { checks, inputs };
    }

    return { run };
})();

function generateBasePlateBreakdown(name, data, design_method) {
    const { check, details } = data;
    if (!check || !details) return '';
    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? check.phi : check.omega;
    const capacity_eq = design_method === 'LRFD' ? `&phi;R<sub>n</sub>` : `R<sub>n</sub> / &Omega;`;
    const final_capacity = design_method === 'LRFD' ? check.Rn * factor_val : check.Rn / factor_val;
    const format_list = (items) => `<ul>${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;

    let content = '';
    switch (name) {
        case 'Concrete Bearing':
            content = format_list([
                `Bearing Check per AISC Design Guide 1, 2nd Ed.`,
                `Eccentricity (e) = M/P = ${details.e.toFixed(2)} in`,
                `Max Bearing Pressure (f<sub>p,max</sub>) = ${details.f_p_max.toFixed(2)} ksi`,
                `Nominal Bearing Strength (P<sub>p</sub>) = 0.85 * f'c * A<sub>1</sub> = ${check.Rn.toFixed(2)} kips`,
                `Design Bearing Strength = ${capacity_eq} = ${final_capacity.toFixed(2)} kips`,
                `Bearing Demand = f<sub>p,max</sub> * B * Y = ${data.demand.toFixed(2)} kips`
            ]);
            break;
        case 'Plate Bending':
            content = format_list([
                `Plate Bending Check per AISC Design Guide 1, 2nd Ed.`,
                `Cantilever distances: m = ${details.m.toFixed(2)} in, n = ${details.n.toFixed(2)} in`,
                `Governing Cantilever (l) = ${details.l.toFixed(2)} in`,
                `Required Thickness (t<sub>req</sub>) = l * &radic;(2 * f<sub>p,max</sub> / (0.9 * F<sub>y</sub>))`,
                `t<sub>req</sub> = ${details.l.toFixed(2)} * &radic;(2 * ${details.f_p_max.toFixed(2)} / (0.9 * ${details.Fy})) = <b>${details.t_req.toFixed(3)} in</b>`,
                `Provided Thickness (t<sub>p</sub>) = <b>${data.demand.toFixed(3)} in</b>`
            ]);
            break;
        case 'Anchor Steel Tension':
            content = format_list([
                `Anchor Steel Strength in Tension per ACI 318-19, 17.6.1`,
                `Nominal Strength per bolt (N<sub>sa</sub>) = A<sub>b,N</sub> * f<sub>uta</sub>`,
                `N<sub>sa</sub> = ${details.Ab.toFixed(3)} in² * ${details.Fut} ksi = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${final_capacity.toFixed(2)} kips`
            ]);
            break;
        case 'Anchor Concrete Breakout':
            content = format_list([
                `Concrete Breakout Strength per ACI 318-19, 17.6.2`,
                `Basic Breakout Strength (N<sub>b</sub>) = ${details.Nb.toFixed(2)} lbs`,
                `Group Breakout Strength (N<sub>cbg</sub>) = (A<sub>Nc</sub>/A<sub>Nco</sub>) * &Psi;<sub>factors</sub> * N<sub>b</sub> = ${details.Ncb_single.toFixed(2)} lbs`,
                `Total Nominal Strength (R<sub>n</sub>) = N<sub>cbg</sub> * n<sub>bolts</sub> = <b>${check.Rn.toFixed(2)} lbs</b>`,
                `Design Capacity = ${capacity_eq} = ${final_capacity.toFixed(2)} lbs`
            ]);
            break;
        default:
            return 'Breakdown not available for this check.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

function renderResults(results) {
    const { checks, inputs } = results;
    const { design_method } = inputs;

    let html = `<div id="baseplate-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
                    <div class="flex justify-end gap-2 -mt-2 -mr-2 print-hidden">
                        <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm print-hidden">Download PDF</button>
                        <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm print-hidden">Copy Report</button>
                    </div>
                    <h2 class="report-header !mt-0 text-center">Base Plate & Anchorage Check Results (${design_method})</h2>
                    <div id="baseplate-checks-section" class="report-section-copyable">
                        <div class="flex justify-between items-center">
                             <h3 class="report-header !text-lg !mb-0 !pb-0 !border-b-0 flex-grow">Summary of Design Checks</h3>
                             <button data-copy-target-id="baseplate-checks-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs print-hidden">Copy Section</button>
                        </div>
                        <table class="mt-2">
                            <thead class="text-sm">
                                <tr>
                                    <th class="w-2/5">Limit State</th>
                                    <th>Demand</th>
                                    <th>Capacity</th>
                                    <th>Ratio</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>`;

    const addRow = (name, data) => {
        if (!data || !data.check) return '';
        let { demand, check } = data;
        const { Rn, phi, omega } = check;

        const capacity = Rn || 0;
        const design_capacity = design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);
        
        let ratio, demand_val, capacity_val;
        
        if (name === 'Plate Bending') {
            // For thickness, demand is provided, capacity is required. Ratio is req/prov.
            demand_val = demand; // provided tp
            capacity_val = design_capacity; // required t_req
            ratio = demand_val > 0 ? capacity_val / demand_val : Infinity;
        } else {
            demand_val = demand;
            capacity_val = design_capacity;
            ratio = capacity_val > 0 ? Math.abs(demand_val) / capacity_val : Infinity;
        }

        const status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const breakdownHtml = generateBasePlateBreakdown(name, data, design_method);
        const detailId = `details-${name.replace(/\s/g, '-')}`;

        return `<tr class="border-t dark:border-gray-700">
                    <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${demand_val.toFixed(2)}</td>
                    <td>${capacity_val.toFixed(2)}</td>
                    <td>${ratio.toFixed(3)}</td>
                    <td>${status}</td>
                 </tr>
                 <tr id="${detailId}" class="details-row">
                    <td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td>
                 </tr>`;
    };

    Object.entries(checks).forEach(([name, data]) => {
        html += addRow(name, data);
    });

    html += `</tbody></table></div></div>`;
    document.getElementById('steel-results-container').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
    const handleRunBasePlateCheck = createCalculationHandler({
        inputIds: basePlateInputIds,
        storageKey: 'baseplate-inputs',
        validationRuleKey: 'baseplate',
        calculatorFunction: basePlateCalculator.run,
        renderFunction: renderResults,
        resultsContainerId: 'steel-results-container',
        buttonId: 'run-steel-check-btn'
    });
    injectHeader({
        activePage: 'base-plate',
        pageTitle: 'AISC Base Plate & Anchorage Checker',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({
        footerPlaceholderId: 'footer-placeholder'
    });
    initializeSharedUI();

    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunBasePlateCheck);

    // --- Diagram and File I/O Listeners ---
    const handleSaveInputs = createSaveInputsHandler(basePlateInputIds, 'baseplate-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(basePlateInputIds, drawBaseplateDiagram); // Redraw after loading
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);

    const diagramInputsToWatch = ['base_plate_length_N', 'base_plate_width_B', 'column_depth_d', 'column_flange_width_bf', 'bolt_spacing_N', 'bolt_spacing_B', 'anchor_bolt_diameter'];
    diagramInputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', drawBaseplateDiagram);
    });

    loadInputsFromLocalStorage('baseplate-inputs', basePlateInputIds, drawBaseplateDiagram); // Redraw after loading from storage

    document.getElementById('steel-results-container').addEventListener('click', async (event) => {
        if (event.target.id === 'copy-report-btn') {
            await handleCopyToClipboard('steel-results-container', 'feedback-message');
        }
        if (event.target.id === 'print-report-btn') {
            window.print();
        }
        if (event.target.id === 'download-pdf-btn') {
            handleDownloadPdf('steel-results-container', 'Base-Plate-Report.pdf');
        }
        const copySectionBtn = event.target.closest('.copy-section-btn');
        if (copySectionBtn) {
            await handleCopyToClipboard(copySectionBtn.dataset.copyTargetId, 'feedback-message');
        }
        const button = event.target.closest('.toggle-details-btn');
        if (button) {
            const detailId = button.dataset.toggleId;
            const row = document.getElementById(detailId);
            row?.classList.toggle('is-visible');
            button.textContent = row?.classList.contains('is-visible') ? '[Hide]' : '[Show]';
        }
    });
});