let lastX = null, lastY = null, lastResult = null;

// Initialize spreadsheet table rows
function initSpreadsheet(rowCount = 8) {
    const tbody = document.getElementById("dataTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let i = 0; i < rowCount; i++) {
        addSpreadsheetRow(tbody, i + 1);
    }
    updateDataCount();
}

function addSpreadsheetRow(tbody, rowNum, xVal = "", yVal = "") {
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td class="row-number">${rowNum}</td>
        <td contenteditable="true" class="cell cell-x">${xVal}</td>
        <td contenteditable="true" class="cell cell-y">${yVal}</td>
    `;
    tbody.appendChild(tr);
}

// Extract numeric data from spreadsheet table safely
function parseSpreadsheetTable() {
    const rows = document.querySelectorAll("#dataTableBody tr");
    const xValues = [], yValues = [];

    rows.forEach((tr, index) => {
        const xText = tr.querySelector(".cell-x")?.textContent.trim() || "";
        const yText = tr.querySelector(".cell-y")?.textContent.trim() || "";

        // Skip blank rows cleanly without throwing errors
        if (xText === "" && yText === "") return;

        const x = Number(xText);
        const y = Number(yText);

        if (!Number.isFinite(x)) {
            throw new Error(`Invalid concentration on row ${index + 1}: "${xText}".`);
        }
        if (!Number.isFinite(y)) {
            throw new Error(`Invalid response on row ${index + 1}: "${yText}".`);
        }

        xValues.push(x);
        yValues.push(y);
    });

    if (xValues.length < 3) {
        throw new Error("At least three valid data pairs are required.");
    }
    return { xValues, yValues };
}

// Weighting calculation for all strategies
function getWeights(xValues, yValues, strategy) {
    return yValues.map((y, i) => {
        const x = xValues[i];
        switch (strategy) {
            case "invY": return y !== 0 ? 1 / Math.abs(y) : 1;
            case "invY2": return y !== 0 ? 1 / (y * y) : 1;
            case "invX": return x !== 0 ? 1 / Math.abs(x) : 1;
            case "invX2": return x !== 0 ? 1 / (x * x) : 1;
            default: return 1;
        }
    });
}

// Gaussian Elimination Matrix Solver for Polynomial Systems
function solveMatrix(A, B) {
    const n = A.length;
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
        }
        [A[i], A[maxRow]] = [A[maxRow], A[i]];
        [B[i], B[maxRow]] = [B[maxRow], B[i]];

        if (Math.abs(A[i][i]) < 1e-12) continue;

        for (let k = i + 1; k < n; k++) {
            const c = -A[k][i] / A[i][i];
            for (let j = i; j < n; j++) {
                if (i === j) A[k][j] = 0;
                else A[k][j] += c * A[i][j];
            }
            B[k] += c * B[i];
        }
    }

    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) sum += A[i][j] * x[j];
        x[i] = (B[i] - sum) / (A[i][i] || 1);
    }
    return x;
}

/* ============================================================
    REGRESSION MODELS ENGINE
============================================================ */

// 1. Linear (y = mx + c)
function fitLinear(xValues, yValues, weights) {
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    const wArr = weights || xValues.map(() => 1);

    for (let i = 0; i < xValues.length; i++) {
        const x = xValues[i], y = yValues[i], w = wArr[i];
        sw += w; swx += w * x; swy += w * y;
        swxx += w * x * x; swxy += w * x * y;
    }

    const denom = sw * swxx - swx * swx;

    if (Math.abs(denom) < 1e-12) {
        const avgY = swy / (sw || 1);
        return {
            type: "linear",
            params: { slope: 0, intercept: avgY, m: 0, c: avgY },
            predict: () => avgY,
            equation: `y = ${avgY}`
        };
    }

    const m = (sw * swxy - swx * swy) / denom;
    const c = (swy * swxx - swx * swxy) / denom;
    const sign = c >= 0 ? "+" : "-";

    return {
        type: "linear",
        params: { slope: m, intercept: c, m: m, c: c },
        predict: (x) => m * x + c,
        equation: `y = ${m}x ${sign} ${Math.abs(c)}`
    };
}

// 2. Quadratic (y = ax² + bx + c)
function fitQuadratic(xValues, yValues, weights) {
    let sw = 0, swx = 0, swx2 = 0, swx3 = 0, swx4 = 0;
    let swy = 0, swxy = 0, swx2y = 0;

    for (let i = 0; i < xValues.length; i++) {
        const x = xValues[i], y = yValues[i], w = weights[i];
        const x2 = x * x;
        sw += w; swx += w * x; swx2 += w * x2;
        swx3 += w * x2 * x; swx4 += w * x2 * x2;
        swy += w * y; swxy += w * x * y; swx2y += w * x2 * y;
    }

    const A = [[swx4, swx3, swx2], [swx3, swx2, swx], [swx2, swx, sw]];
    const B = [swx2y, swxy, swy];
    const [a, b, c] = solveMatrix(A, B);

    return {
        type: "quadratic",
        params: { a, b, c },
        predict: (x) => a * x * x + b * x + c,
        equation: `y = ${a}x² + ${b}x + ${c}`
    };
}

// 3. Cubic (y = ax³ + bx² + cx + d)
function fitCubic(xValues, yValues, weights) {
    let s = new Array(7).fill(0);
    let sy = new Array(4).fill(0);

    for (let i = 0; i < xValues.length; i++) {
        const x = xValues[i], y = yValues[i], w = weights[i];
        let xPow = w;
        for (let j = 0; j <= 6; j++) {
            s[j] += xPow;
            if (j < 4) sy[j] += xPow * y;
            xPow *= x;
        }
    }

    const A = [
        [s[6], s[5], s[4], s[3]],
        [s[5], s[4], s[3], s[2]],
        [s[4], s[3], s[2], s[1]],
        [s[3], s[2], s[1], s[0]]
    ];
    
    const B = [sy[3], sy[2], sy[1], sy[0]];
    const [a, b, c, d] = solveMatrix(A, B);

    return {
        type: "cubic",
        params: { a, b, c, d },
        predict: (x) => a * Math.pow(x, 3) + b * Math.pow(x, 2) + c * x + d,
        equation: `y = ${a}x³ + ${b}x² + ${c}x + ${d}`
    };
}

// 4. 4PL Logistic with Full Floating Precision & Flexible Bounds
function fit4PL(xValues, yValues, weights, constrained = false) {
    const minY = Math.min(...yValues), maxY = Math.max(...yValues);
    const minX = Math.min(...xValues), maxX = Math.max(...xValues);

    let A = minY * 0.9;
    let B = 1.0;
    let C = (minX + maxX) / 2;
    let D = maxY * 1.1;

    const evaluate = (x, a, b, c, d) => {
        const ratio = Math.max(x, 1e-12) / Math.max(c, 1e-12);
        return d + (a - d) / (1 + Math.pow(ratio, b));
    };

    const getSSR = (a, b, c, d) => {
        let sum = 0;
        for (let i = 0; i < xValues.length; i++) {
            const pred = evaluate(xValues[i], a, b, c, d);
            const w = weights ? weights[i] : 1;
            sum += w * Math.pow(yValues[i] - pred, 2);
        }
        return sum;
    };

    let bestSSR = getSSR(A, B, C, D);
    let stepA = (maxY - minY) * 0.1;
    let stepB = 0.1;
    let stepC = (maxX - minX) * 0.1;
    let stepD = (maxY - minY) * 0.1;

    for (let iter = 0; iter < 3000; iter++) {
        let improved = false;

        const params = [
            { name: 'A', val: A, step: stepA, set: (v) => A = constrained ? Math.max(minY * 0.5, Math.min(maxY, v)) : v },
            { name: 'B', val: B, step: stepB, set: (v) => B = Math.max(0.01, Math.min(10, v)) },
            { name: 'C', val: C, step: stepC, set: (v) => C = constrained ? Math.max(minX * 0.1, Math.min(maxX * 10, v)) : Math.max(1e-12, v) },
            { name: 'D', val: D, step: stepD, set: (v) => D = constrained ? Math.max(minY, Math.min(maxY * 2.0, v)) : v }
        ];

        for (const p of params) {
            for (const dir of [1, -1]) {
                const testVal = p.val + dir * p.step;
                const oldVal = p.val;
                p.set(testVal);

                const ssr = getSSR(A, B, C, D);
                if (ssr < bestSSR) {
                    bestSSR = ssr;
                    improved = true;
                    break;
                } else {
                    p.set(oldVal);
                }
            }
        }

        if (!improved) {
            stepA *= 0.5; stepB *= 0.5; stepC *= 0.5; stepD *= 0.5;
            if (stepA < 1e-12) break;
        }
    }

    return {
        type: "4pl",
        params: { bottom: A, hillSlope: B, ic50: C, top: D },
        predict: (x) => evaluate(x, A, B, C, D),
        equation: `y = ${D} + (${A} - ${D}) / (1 + (x / ${C})^${B})`
    };
}

// 5. 5PL Asymmetrical Curve
function fit5PL(xValues, yValues, weights) {
    const minY = Math.min(...yValues), maxY = Math.max(...yValues);
    const minX = Math.min(...xValues), maxX = Math.max(...xValues);

    let A = minY, D = maxY, C = minX + (maxX - minX) / 2, B = 1.0, G = 1.0;
    const evaluate = (x, a, b, c, d, g) => d + (a - d) / Math.pow(1 + Math.pow(Math.max(x, 1e-9) / Math.max(c, 1e-9), b), g);

    for (let iter = 0; iter < 250; iter++) {
        for (let i = 0; i < xValues.length; i++) {
            const x = xValues[i], y = yValues[i], w = weights[i];
            const pred = evaluate(x, A, B, C, D, G);
            const err = (y - pred) * w;
            A += err * 0.004; D += err * 0.004;
            if (x > 0) C += err * 0.002 * C;
            G += err * 0.001;
        }
    }

    return {
        type: "5pl",
        params: { bottom: A, top: D, ic50: C, hillSlope: B, asymmetry: G },
        predict: (x) => evaluate(x, A, B, C, D, G),
        equation: `y = ${D} + (${A} - ${D}) / (1 + (x / ${C})^${B})^${G}`
    };
}

// 6. Michaelis-Menten Kinetics [y = (Vmax * x) / (Km + x)]
function fitMichaelisMenten(xValues, yValues, weights) {
    let Vmax = Math.max(...yValues);
    let Km = Math.max(...xValues) / 2;

    const evaluate = (x, v, k) => (v * x) / (k + x);

    for (let iter = 0; iter < 200; iter++) {
        for (let i = 0; i < xValues.length; i++) {
            const x = xValues[i], y = yValues[i], w = weights[i];
            const pred = evaluate(x, Vmax, Km);
            const err = (y - pred) * w;
            Vmax += err * 0.01;
            Km += err * 0.005 * Km;
        }
    }

    return {
        type: "michaelisMenten",
        params: { Vmax, Km },
        predict: (x) => evaluate(x, Vmax, Km),
        equation: `y = (${Vmax} * x) / (${Km} + x)`
    };
}

// 7. Exponential Growth [y = A * e^(k * x)]
function fitExpGrowth(xValues, yValues, weights) {
    const logY = yValues.map(y => Math.log(Math.max(y, 1e-6)));
    const lin = fitLinear(xValues, logY, weights);
    const A = Math.exp(lin.params.intercept);
    const k = lin.params.slope;

    return {
        type: "expGrowth",
        params: { A, k },
        predict: (x) => A * Math.exp(k * x),
        equation: `y = ${A} * e^(${k}x)`
    };
}

// 8. Exponential Decay [y = A * e^(-k * x) + C]
function fitExpDecay(xValues, yValues, weights) {
    const minY = Math.min(...yValues);
    const offset = minY > 0 ? minY * 0.5 : 0;
    const logY = yValues.map(y => Math.log(Math.max(y - offset, 1e-6)));
    const lin = fitLinear(xValues, logY, weights);
    const A = Math.exp(lin.params.intercept);
    const k = Math.abs(lin.params.slope);

    return {
        type: "expDecay",
        params: { A, k, offset },
        predict: (x) => A * Math.exp(-k * x) + offset,
        equation: `y = ${A} * e^(-${k}x) + ${offset}`
    };
}

// 9. Gaussian / Bell Curve [y = Amp * e^(-((x - Mean)^2) / (2 * SD^2))]
function fitGaussian(xValues, yValues, weights) {
    let Amp = Math.max(...yValues);
    let Mean = xValues[yValues.indexOf(Amp)] || 0;
    let SD = (Math.max(...xValues) - Math.min(...xValues)) / 4;

    const evaluate = (x, amp, mean, sd) => amp * Math.exp(-Math.pow(x - mean, 2) / (2 * Math.pow(sd, 2)));

    for (let iter = 0; iter < 250; iter++) {
        for (let i = 0; i < xValues.length; i++) {
            const x = xValues[i], y = yValues[i], w = weights[i];
            const pred = evaluate(x, Amp, Mean, SD);
            const err = (y - pred) * w;
            Amp += err * 0.01;
            Mean += err * 0.005;
            SD += err * 0.002;
        }
    }

    return {
        type: "gaussian",
        params: { Amp, Mean, SD },
        predict: (x) => evaluate(x, Amp, Mean, SD),
        equation: `y = ${Amp} * e^(-(x - ${Mean})² / (2 * ${SD}²))`
    };
}

// Calculate full regression statistical metrics
function calculateFitStats(xValues, yValues, result) {
    const n = xValues.length;
    // Count estimated parameters
    const k = Object.keys(result.params || {}).length; 
    const dof = Math.max(1, n - k);

    const meanY = yValues.reduce((a, b) => a + b, 0) / n;
    let ssTot = 0, ssRes = 0;

    for (let i = 0; i < n; i++) {
        ssTot += Math.pow(yValues[i] - meanY, 2);
        ssRes += Math.pow(yValues[i] - result.predict(xValues[i]), 2);
    }

    const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
    
    // Adjusted R²
    const adjR2 = n > k ? 1 - ((1 - r2) * (n - 1) / (n - k)) : r2;

    // Standard Error & Sum of Squared Errors
    const sse = ssRes;
    const se = Math.sqrt(sse / dof);

    // F-Statistic & P-Value
    const msReg = (ssTot - ssRes) / (k - 1 || 1);
    const msRes = sse / dof;
    const fStat = msRes > 0 ? msReg / msRes : 0;
    
    // Simplified approximation for P-value based on F-stat
    const pValue = fStat > 0 ? Math.exp(-0.5 * fStat) : 1;

    // Information Criteria: AIC, BIC, AICc
    const sigma2 = sse / n;
    const aic = sigma2 > 0 ? n * Math.log(sigma2) + 2 * k : 0;
    const bic = sigma2 > 0 ? n * Math.log(sigma2) + k * Math.log(n) : 0;
    const aicc = (n - k - 1) > 0 ? aic + (2 * k * (k + 1)) / (n - k - 1) : aic;

    return {
        r2: r2,
        adjR2: adjR2,
        pValue: pValue,
        se: se,
        sse: sse,
        fStat: fStat,
        aic: aic,
        bic: bic,
        dof: dof,
        aicc: aicc
    };
}

function copySectionText(button, textToCopy) {
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = button.innerHTML;
        button.innerHTML = "✓ Copied";
        button.classList.add("copied");

        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.remove("copied");
        }, 1500);
    }).catch(err => {
        console.error("Failed to copy text: ", err);
    });
}

// Handler for parameter block: Name, Label, Value each in separate cells
function copyParametersText(button) {
    const cards = document.querySelectorAll("#parameterGrid .parameter-card");
    const rows = [];
    
    // Header row for Excel
    rows.push(["Parameter", "Description", "Value"].join("\t"));

    cards.forEach(card => {
        const name = card.querySelector(".parameter-name")?.textContent.trim() || "";
        const label = card.querySelector(".parameter-label")?.textContent.trim() || "";
        const value = card.querySelector("strong")?.textContent.trim() || "";
        rows.push([name, label, value].join("\t"));
    });

    copySectionText(button, rows.join("\n"));
}

function displayResults(result, xValues, yValues) {
    const resultsCard = document.getElementById("results");
    const paramsDiv = document.getElementById("parameters");
    const pointCountSpan = document.getElementById("pointCount");

    if (!resultsCard || !paramsDiv) return;

    resultsCard.classList.remove("hidden");
    if (pointCountSpan) pointCountSpan.textContent = `${xValues.length} Points Fitted`;

    // Compute stats & parameters
    const stats = calculateFitStats(xValues, yValues, result);
    const p = result.params;

    // --- 1. PARAMETERS SECTION ---
    let paramsHTML = `
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; color: #1e293b; font-size: 0.95rem;">Model Parameters</h4>
            <!-- Parameter Copy Button -->
            <button class="btn-copy-mini" onclick="copyParametersText(this)">Copy</button>
        </div>
        <div class="parameter-grid" id="parameterGrid">`;

    if (result.type === "4pl" || result.type === "5pl") {
        paramsHTML += `
            <div class="parameter-card"><span class="parameter-name">A</span><span class="parameter-label">Bottom</span><strong>${p.bottom}</strong></div>
            <div class="parameter-card"><span class="parameter-name">B</span><span class="parameter-label">Hill Slope</span><strong>${p.hillSlope}</strong></div>
            <div class="parameter-card highlight"><span class="parameter-name">C</span><span class="parameter-label">EC50 / IC50</span><strong>${p.ic50}</strong></div>
            <div class="parameter-card"><span class="parameter-name">D</span><span class="parameter-label">Top</span><strong>${p.top}</strong></div>
        `;
        if (result.type === "5pl") {
            paramsHTML += `<div class="parameter-card"><span class="parameter-name">G</span><span class="parameter-label">Asymmetry</span><strong>${p.asymmetry}</strong></div>`;
        }
    } else if (result.type === "michaelisMenten") {
        paramsHTML += `
            <div class="parameter-card highlight"><span class="parameter-name">Vmax</span><span class="parameter-label">Max Velocity</span><strong>${p.Vmax}</strong></div>
            <div class="parameter-card highlight"><span class="parameter-name">Km</span><span class="parameter-label">Michaelis Const.</span><strong>${p.Km}</strong></div>
        `;
    } else if (result.type === "gaussian") {
        paramsHTML += `
            <div class="parameter-card highlight"><span class="parameter-name">Amp</span><span class="parameter-label">Peak Height</span><strong>${p.Amp}</strong></div>
            <div class="parameter-card"><span class="parameter-name">Mean</span><span class="parameter-label">Center (x0)</span><strong>${p.Mean}</strong></div>
            <div class="parameter-card"><span class="parameter-name">SD</span><span class="parameter-label">Std Deviation</span><strong>${p.SD}</strong></div>
        `;
    } else if (result.type === "cubic") {
        paramsHTML += `
            <div class="parameter-card"><span class="parameter-name">a</span><span class="parameter-label">x³ Coeff</span><strong>${p.a}</strong></div>
            <div class="parameter-card"><span class="parameter-name">b</span><span class="parameter-label">x² Coeff</span><strong>${p.b}</strong></div>
            <div class="parameter-card"><span class="parameter-name">c</span><span class="parameter-label">x Coeff</span><strong>${p.c}</strong></div>
            <div class="parameter-card"><span class="parameter-name">d</span><span class="parameter-label">Intercept</span><strong>${p.d}</strong></div>
        `;
    } else if (result.type === "quadratic") {
        paramsHTML += `
            <div class="parameter-card"><span class="parameter-name">a</span><span class="parameter-label">x² Coeff</span><strong>${p.a}</strong></div>
            <div class="parameter-card"><span class="parameter-name">b</span><span class="parameter-label">x Coeff</span><strong>${p.b}</strong></div>
            <div class="parameter-card"><span class="parameter-name">c</span><span class="parameter-label">Intercept</span><strong>${p.c}</strong></div>
        `;
    } else if (result.type === "expGrowth" || result.type === "expDecay") {
        paramsHTML += `
            <div class="parameter-card"><span class="parameter-name">A</span><span class="parameter-label">Amplitude</span><strong>${p.A}</strong></div>
            <div class="parameter-card"><span class="parameter-name">k</span><span class="parameter-label">Rate Const.</span><strong>${p.k}</strong></div>
        `;
    } else {
        paramsHTML += `
            <div class="parameter-card"><span class="parameter-name">m</span><span class="parameter-label">Slope</span><strong>${p.slope}</strong></div>
            <div class="parameter-card"><span class="parameter-name">c</span><span class="parameter-label">Intercept</span><strong>${p.c}</strong></div>
        `;
    }
    paramsHTML += `</div>`;

    // Format tab-separated data for Excel copying
    const fitStatsExcelString = [
        ["Metric", "Value"].join("\t"),
        ["R²", stats.r2.toFixed(4)].join("\t"),
        ["aR²", stats.adjR2.toFixed(4)].join("\t"),
        ["P", stats.pValue < 0.0001 ? stats.pValue.toExponential(4) : stats.pValue.toFixed(6)].join("\t"),
        ["SE", stats.se.toFixed(4)].join("\t"),
        ["SSE", stats.sse.toFixed(4)].join("\t"),
        ["F", stats.fStat.toFixed(1)].join("\t"),
        ["AIC", stats.aic.toFixed(3)].join("\t"),
        ["BIC", stats.bic.toFixed(3)].join("\t"),
        ["DoF", stats.dof].join("\t"),
        ["AICc", stats.aicc.toFixed(3)].join("\t")
    ].join("\n");

    // --- 2. GOODNESS OF FIT SECTION ---
    paramsHTML += `
        <div class="fit-stats-container" style="margin-top: 15px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0; color: #1e293b; font-size: 0.95rem;">Goodness of Fit</h4>
                <!-- Fit Stats Copy Button -->
                <button class="btn-copy-mini" onclick="copySectionText(this, \`${fitStatsExcelString}\`)">Copy</button>
            </div>
            <div class="fit-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; font-size: 0.85rem;">
                <div><span>R²</span> <strong>${stats.r2.toFixed(4)}</strong></div>
                <div><span>aR²</span> <strong>${stats.adjR2.toFixed(4)}</strong></div>
                <div><span>P</span> <strong>${stats.pValue < 0.0001 ? stats.pValue.toExponential(4) : stats.pValue.toFixed(6)}</strong></div>
                <div><span>SE</span> <strong>${stats.se.toFixed(4)}</strong></div>
                <div><span>SSE</span> <strong>${stats.sse.toFixed(4)}</strong></div>
                <div><span>F</span> <strong>${stats.fStat.toFixed(1)}</strong></div>
                <div><span>AIC</span> <strong>${stats.aic.toFixed(3)}</strong></div>
                <div><span>BIC</span> <strong>${stats.bic.toFixed(3)}</strong></div>
                <div><span>DoF</span> <strong>${stats.dof}</strong></div>
                <div><span>AICc</span> <strong>${stats.aicc.toFixed(3)}</strong></div>
            </div>
        </div>
    `;

    // --- 3. MODEL EQUATION SECTION ---
    paramsHTML += `
        <div class="equation-box" style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div style="flex-grow: 1; margin-right: 10px;">
                <span style="display: block; font-size: 0.8rem; color: #64748b; margin-bottom: 4px;">Model Equation</span>
                <code id="equationCode" style="font-size: 0.9rem;">${result.equation}</code>
            </div>
            <!-- Equation Copy Button -->
            <button class="btn-copy-mini" onclick="copySectionText(this, \`${result.equation}\`)">Copy</button>
        </div>
    `;

    paramsDiv.innerHTML = paramsHTML;
    drawChart(xValues, yValues, result);
}

function drawChart(xValues, yValues, result) {
    // 1. Check if Chart.js is loaded
    if (typeof Chart === "undefined") {
        console.warn("Chart.js is not loaded. Skipping chart rendering.");
        const canvas = document.getElementById("fitChart");
        if (canvas && canvas.parentElement) {
            canvas.parentElement.innerHTML = `
                <div style="padding: 16px; color: var(--danger); font-family: var(--font-mono); font-size: 12px; border: 1px dashed var(--danger-border); background: var(--danger-bg); border-radius: 3px;">
                    [Chart Error]: Chart.js library failed to load. Check your internet connection or script tags.
                </div>`;
        }
        return;
    }

    // 2. Locate Canvas Element
    const canvas = document.getElementById("fitChart");
    if (!canvas) return;

    // 3. Destroy existing instance before redrawing
    if (window.myFitChart instanceof Chart) {
        window.myFitChart.destroy();
    }

    // 4. Calculate curve data points
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const step = (maxX - minX) / 100 || 1;
    const curveData = [];

    for (let x = minX; x <= maxX; x += step) {
        curveData.push({ x: x, y: result.predict(x) });
    }

    const scatterData = xValues.map((x, i) => ({ x: x, y: yValues[i] }));

    // 5. Render Chart safely
    requestAnimationFrame(() => {
        const ctx = canvas.getContext("2d");

        window.myFitChart = new Chart(ctx, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        label: "Observed Data",
                        data: scatterData,
                        backgroundColor: "#0284c7",
                        borderColor: "#0369a1",
                        pointRadius: 5,
                        showLine: false
                    },
                    {
                        label: `Fitted Curve (${result.type.toUpperCase()})`,
                        data: curveData,
                        type: "line",
                        borderColor: "#dc2626",
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { type: "linear", position: "bottom" }
                }
            }
        });
    });
}

// Master calculation entry point
function calculate4PL() {
    try {
        clearError();
        const { xValues, yValues } = parseSpreadsheetTable();
        const modelType = document.getElementById("fitModel")?.value || "4pl";
        const weightType = document.getElementById("weighting")?.value || "none";
        const weights = getWeights(xValues, yValues, weightType);

        let result;
        switch (modelType) {
            case "linear": result = fitLinear(xValues, yValues, weights); break;
            case "quadratic": result = fitQuadratic(xValues, yValues, weights); break;
            case "cubic": result = fitCubic(xValues, yValues, weights); break;
            case "4pl_constrained": result = fit4PL(xValues, yValues, weights, true); break;
            case "4pl_unconstrained": result = fit4PL(xValues, yValues, weights, false); break;
            case "5pl": result = fit5PL(xValues, yValues, weights); break;
            case "michaelisMenten": result = fitMichaelisMenten(xValues, yValues, weights); break;
            case "expGrowth": result = fitExpGrowth(xValues, yValues, weights); break;
            case "expDecay": result = fitExpDecay(xValues, yValues, weights); break;
            case "gaussian": result = fitGaussian(xValues, yValues, weights); break;
            case "4pl": default: result = fit4PL(xValues, yValues, weights, false); break;
        }

        lastX = xValues; lastY = yValues; lastResult = result;
        displayResults(result, xValues, yValues);
    } catch (error) {
        console.error("Calculation error:", error);
        showError(error.message);
    }
}

function updateDataCount() {
    const countEl = document.getElementById("dataCount");
    if (!countEl) return;
    try {
        const { xValues } = parseSpreadsheetTable();
        countEl.textContent = `${xValues.length} data point${xValues.length === 1 ? "" : "s"}`;
    } catch {
        countEl.textContent = "0 data points";
    }
}

function showError(message) {
    const errorBox = document.getElementById("inputError");
    if (errorBox) {
        errorBox.textContent = message;
        errorBox.classList.remove("hidden");
    }
}

function clearError() {
    const errorBox = document.getElementById("inputError");
    if (errorBox) {
        errorBox.textContent = "";
        errorBox.classList.add("hidden");
    }
}

function clearCalculator() {
    initSpreadsheet(8);
    const results = document.getElementById("results");
    if (results) results.classList.add("hidden");
    clearError();
    lastX = null; lastY = null; lastResult = null;
}

// Clipboard Paste & Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    initSpreadsheet(8);

    const table = document.getElementById("dataTable");
    if (table) {
        table.addEventListener("paste", (e) => {
            e.preventDefault();
            const clipboardData = (e.clipboardData || window.clipboardData).getData("text");
            if (!clipboardData) return;

            const lines = clipboardData.trim().split(/\r?\n/);
            const tbody = document.getElementById("dataTableBody");
            if (!tbody) return;

            tbody.innerHTML = "";

            lines.forEach((line, idx) => {
                const cols = line.split(/\t|,/);
                const xVal = cols[0] ? cols[0].trim() : "";
                const yVal = cols[1] ? cols[1].trim() : "";
                addSpreadsheetRow(tbody, idx + 1, xVal, yVal);
            });

            const minRows = 8;
            if (lines.length < minRows) {
                for (let i = lines.length; i < minRows; i++) {
                    addSpreadsheetRow(tbody, i + 1, "", "");
                }
            }

            updateDataCount();
        });

        table.addEventListener("input", updateDataCount);
    }

    const calculateButton = document.getElementById("calculateButton");
    const clearButton = document.getElementById("clearButton");

    if (calculateButton) calculateButton.addEventListener("click", calculate4PL);
    if (clearButton) clearButton.addEventListener("click", clearCalculator);

    const fitModelSelect = document.getElementById("fitModel");
    const weightingSelect = document.getElementById("weighting");

    function handleAutoUpdate() {
        try {
            calculate4PL();
        } catch {
            // Silence inline auto-update calculation triggers if dataset is incomplete
        }
    }

    if (fitModelSelect) fitModelSelect.addEventListener("change", handleAutoUpdate);
    if (weightingSelect) weightingSelect.addEventListener("change", handleAutoUpdate);
});

window.addEventListener("resize", () => {
    if (lastX && lastY && lastResult && typeof drawChart === "function") {
        drawChart(lastX, lastY, lastResult);
    }
});

window.calculate4PL = calculate4PL;
window.clearCalculator = clearCalculator;