"use strict";
/* ============================================================
   LAB CALCULATOR
   Clean spreadsheet input + prediction table
   ============================================================ */
let lastX = [];
let lastY = [];
let lastResult = null;
let fitChart = null;
/* ============================================================
   HELPERS
   ============================================================ */
function formatNumber(value, significant = 8) {
    if (!Number.isFinite(value)) return "N/A";
    return Number(value).toPrecision(significant);
}
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function showError(message) {
    const el = document.getElementById("inputError");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
}
function clearError() {
    const el = document.getElementById("inputError");
    if (el) {
        el.textContent = "";
        el.classList.add("hidden");
    }
}
/* ============================================================
   STANDARD INPUT TABLE
   ============================================================ */
function getInputBody() {
    return document.querySelector("#dataTable tbody");
}

function initInputTable(rows = 8) {
    const tbody = getInputBody();
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let i = 0; i < rows; i++) {
        addInputRow();
    }
    updateInputCount();
}
function updateInputCount() {
    const tbody = getInputBody();
    const count = document.getElementById("dataCount");
    if (!tbody || !count) return;
    let valid = 0;
    for (const row of tbody.rows) {
        const x = row.querySelector(".cell-x")?.textContent.trim();
        const y = row.querySelector(".cell-y")?.textContent.trim();
        if (x !== "" && y !== "" && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
            valid++;
        }
    }
    count.textContent = `${valid} data point${valid === 1 ? "" : "s"}`;
}
function addInputRow(x = "", y = "") {
    const tbody = document.getElementById("dataTableBody");
    if (!tbody) return;

    const row = tbody.rows.length + 1;

    const tr = document.createElement("tr");

    tr.innerHTML = `
        <td class="row-number">${row}</td>
        <td class="cell">
            <input class="cell-input cell-x" type="text" value="${escapeHtml(x)}">
        </td>
        <td class="cell">
            <input class="cell-input cell-y" type="text" value="${escapeHtml(y)}">
        </td>
    `;

    tbody.appendChild(tr);
}


function addPredictionRow(sample = "", y = "") {
    const tbody = document.getElementById("predictTableBody");
    if (!tbody) return;

    const row = tbody.rows.length + 1;

    const tr = document.createElement("tr");

    tr.innerHTML = `
        <td class="row-number">${row}</td>
        <td class="cell">
            <input class="cell-input cell-sample" type="text"
                   value="${escapeHtml(sample)}">
        </td>
        <td class="cell">
            <input class="cell-input cell-predict-y" type="text"
                   value="${escapeHtml(y)}">
        </td>
        <td class="cell cell-predict-x"></td>
    `;

    tbody.appendChild(tr);
}

function ensureInputRow() {
    const tbody = getInputBody();
    if (!tbody || !tbody.lastElementChild) return;
    const last = tbody.lastElementChild;
    const x = last.querySelector(".cell-x")?.textContent.trim();
    const y = last.querySelector(".cell-y")?.textContent.trim();
    if (x !== "" || y !== "") {
        addInputRow();
    }
}
/* ============================================================
   PARSE INPUT TABLE
   ============================================================ */
function getInputData() {
    const tbody = getInputBody();
    if (!tbody) {
        throw new Error("Input table not found.");
    }
    const x = [];
    const y = [];
    for (const row of tbody.rows) {
        const xText = row.querySelector(".cell-x")?.textContent.trim();
        const yText = row.querySelector(".cell-y")?.textContent.trim();
        if (!xText && !yText) continue;
        const xv = Number(xText);
        const yv = Number(yText);
        if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
            throw new Error("Every populated row must contain valid X and Y numbers.");
        }
        x.push(xv);
        y.push(yv);
    }
    if (x.length < 3) {
        throw new Error("At least three valid data pairs are required.");
    }
    return { x, y };
}
/* ============================================================
   EXCEL / GOOGLE SHEETS PASTE
   ============================================================ */
function handleInputPaste(event) {
    const text = event.clipboardData?.getData("text");
    if (!text) return;
    event.preventDefault();
    const lines = text
        .replace(/\r/g, "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);
    const rows = lines.map(line => {
        if (line.includes("\t")) return line.split("\t");
        if (line.includes(",")) return line.split(",");
        return [line];
    });
    if (!rows.length) return;
    // Remove a header row if the first row is not numeric.
    if (
        rows.length > 1 &&
        (!Number.isFinite(Number(rows[0][0])) ||
         !Number.isFinite(Number(rows[0][1])))
    ) {
        rows.shift();
    }
    const tbody = getInputBody();
    if (!tbody) return;
    tbody.innerHTML = "";
    for (const row of rows) {
        if (row.length < 2) continue;
        const xv = row[0].trim();
        const yv = row[1].trim();
        if (!xv && !yv) continue;
        addInputRow(xv, yv);
    }
    while (tbody.rows.length < 8) {
        addInputRow();
    }
    updateInputCount();
}
/* ============================================================
   PREDICTION TABLE
   ============================================================ */
function createPredictionTable() {
    const wrapper = document.querySelector(".spreadsheet-wrapper");
    if (!wrapper) return;
    if (document.getElementById("predictTable")) return;
    const title = document.createElement("div");
    title.className = "section-header";
    title.innerHTML = `
        <div>
            <h2>Predict</h2>
            <p class="section-description">
                Enter sample responses to calculate predicted concentrations.
            </p>
        </div>
    `;
    const table = document.createElement("table");
    table.id = "predictTable";
    table.className = "spreadsheet";
    table.innerHTML = `
        <thead>
            <tr>
                <th class="corner-cell"></th>
                <th class="column-letter">A</th>
                <th class="column-letter">B</th>
                <th class="column-letter">C</th>
            </tr>
            <tr class="header-row">
                <th class="row-number"></th>
                <th>Sample</th>
                <th>Response (Y)</th>
                <th>Predicted X</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const footer = document.createElement("div");
    footer.className = "table-footer";
    footer.innerHTML = `
        <span id="predictCount">0 samples</span>
        <span id="predictionStatus">Fit a model to enable predictions.</span>
        <button id="copyPredictionButton" class="btn-copy-mini">
            Copy
        </button>
    `;
    wrapper.appendChild(title);
    wrapper.appendChild(table);
    wrapper.appendChild(footer);
}
function addPredictionRow(sample = "", y = "") {
    const tbody = document.querySelector("#predictTable tbody");
    if (!tbody) return;
    const row = tbody.rows.length + 1;
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td class="row-number">${row}</td>
        <td class="cell cell-sample" contenteditable="true">${escapeHtml(sample)}</td>
        <td class="cell cell-predict-y" contenteditable="true">${escapeHtml(y)}</td>
        <td class="cell cell-predict-x"></td>
    `;
    tbody.appendChild(tr);
}
function initPredictionTable(rows = 8) {
    const tbody = document.querySelector("#predictTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let i = 0; i < rows; i++) {
        addPredictionRow();
    }
    updatePredictionCount();
}
function ensurePredictionRow() {
    const tbody = document.querySelector("#predictTable tbody");
    if (!tbody || !tbody.lastElementChild) return;
    const last = tbody.lastElementChild;
    const sample = last.querySelector(".cell-sample")?.textContent.trim();
    const y = last.querySelector(".cell-predict-y")?.textContent.trim();
    if (sample !== "" || y !== "") {
        addPredictionRow();
    }
}
function updatePredictionCount() {
    const tbody = document.querySelector("#predictTable tbody");
    const count = document.getElementById("predictCount");
    if (!tbody || !count) return;
    let n = 0;
    for (const row of tbody.rows) {
        const sample = row.querySelector(".cell-sample")?.textContent.trim();
        const y = row.querySelector(".cell-predict-y")?.textContent.trim();
        if (sample || y) n++;
    }
    count.textContent = `${n} sample${n === 1 ? "" : "s"}`;
}
/* ============================================================
   PREDICTION PASTE
   ============================================================ */
function handlePredictionPaste(event) {
    const text = event.clipboardData?.getData("text");
    if (!text) return;
    event.preventDefault();
    const lines = text
        .replace(/\r/g, "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);
    let rows = lines.map(line => {
        if (line.includes("\t")) return line.split("\t");
        if (line.includes(",")) return line.split(",");
        return [line];
    });
    if (!rows.length) return;
    // Skip header.
    if (!Number.isFinite(Number(rows[0][rows[0].length - 1]))) {
        rows.shift();
    }
    const tbody = document.querySelector("#predictTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    let sampleNumber = 1;
    for (const row of rows) {
        let sample;
        let y;
        if (row.length >= 2) {
            sample = row[0].trim();
            y = row[1].trim();
        } else {
            sample = `Sample ${sampleNumber}`;
            y = row[0].trim();
        }
        addPredictionRow(sample, y);
        sampleNumber++;
    }
    while (tbody.rows.length < 8) {
        addPredictionRow();
    }
    updatePredictionCount();
    updatePredictions();
}
/* ============================================================
   MATRIX SOLVER
   ============================================================ */
function solveMatrix(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
        let pivot = i;
        for (let r = i + 1; r < n; r++) {
            if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) {
                pivot = r;
            }
        }
        if (Math.abs(M[pivot][i]) < 1e-12) {
            throw new Error("Model fitting failed: singular data.");
        }
        [M[i], M[pivot]] = [M[pivot], M[i]];
        for (let r = i + 1; r < n; r++) {
            const factor = M[r][i] / M[i][i];
            for (let c = i; c <= n; c++) {
                M[r][c] -= factor * M[i][c];
            }
        }
    }
    const result = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
        let value = M[i][n];
        for (let j = i + 1; j < n; j++) {
            value -= M[i][j] * result[j];
        }
        result[i] = value / M[i][i];
    }
    return result;
}
/* ============================================================
   WEIGHTING
   ============================================================ */
function getWeight(x, y, mode) {
    switch (mode) {
        case "invY":
            return y === 0 ? 1 : 1 / Math.abs(y);
        case "invY2":
            return y === 0 ? 1 : 1 / (y * y);
        case "invX":
            return x === 0 ? 1 : 1 / Math.abs(x);
        case "invX2":
            return x === 0 ? 1 : 1 / (x * x);
        default:
            return 1;
    }
}
/* ============================================================
   LINEAR
   ============================================================ */
function fitLinear(x, y, weighting) {
    let sw = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < x.length; i++) {
        const w = getWeight(x[i], y[i], weighting);
        sw += w;
        sx += w * x[i];
        sy += w * y[i];
        sxx += w * x[i] * x[i];
        sxy += w * x[i] * y[i];
    }
    const denominator = sw * sxx - sx * sx;
    if (Math.abs(denominator) < 1e-12) {
        throw new Error("Linear fit failed.");
    }
    const m = (sw * sxy - sx * sy) / denominator;
    const c = (sy - m * sx) / sw;
    return {
        type: "linear",
        params: { m, c },
        predict: x => m * x + c,
        inverse: yValue => Math.abs(m) < 1e-12 ? null : (yValue - c) / m,
        equation: `y = ${formatNumber(m)}x + ${formatNumber(c)}`
    };
}
/* ============================================================
   POLYNOMIAL
   ============================================================ */
function fitPolynomial(x, y, degree, weighting) {
    const size = degree + 1;
    const A = Array.from({ length: size }, () => Array(size).fill(0));
    const B = Array(size).fill(0);
    for (let i = 0; i < x.length; i++) {
        const w = getWeight(x[i], y[i], weighting);
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                A[r][c] += w * Math.pow(x[i], r + c);
            }
            B[r] += w * y[i] * Math.pow(x[i], r);
        }
    }
    const p = solveMatrix(A, B);
    const predict = xv => {
        let value = 0;
        for (let i = 0; i < p.length; i++) {
            value += p[i] * Math.pow(xv, i);
        }
        return value;
    };
    let equation = "y = ";
    for (let i = degree; i >= 0; i--) {
        if (Math.abs(p[i]) < 1e-12) continue;
        if (equation !== "y = ") {
            equation += p[i] >= 0 ? " + " : " - ";
        } else if (p[i] < 0) {
            equation += "-";
        }
        equation += formatNumber(Math.abs(p[i]));
        if (i === 1) equation += "x";
        if (i > 1) equation += `x^${i}`;
    }
    return {
        type: degree === 2 ? "quadratic" : "cubic",
        params: { coefficients: p },
        predict,
        inverse: null,
        equation
    };
}
/* ============================================================
   4PL
   ============================================================ */
function fourPL(x, A, B, C, D) {
    return D + (A - D) / (1 + Math.pow(x / C, B));
}
function fit4PL(x, y, weighting, constrained) {
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    let A = minY;
    let D = maxY;
    let B = 1;
    let C = (minX + maxX) / 2;
    if (C <= 0) C = Math.max(minX, 0.001);
    function error() {
        let total = 0;
        for (let i = 0; i < x.length; i++) {
            const prediction = fourPL(x[i], A, B, C, D);
            const w = getWeight(x[i], y[i], weighting);
            total += w * Math.pow(y[i] - prediction, 2);
        }
        return total;
    }
    let best = error();
    for (let i = 0; i < 3000; i++) {
        const old = { A, B, C, D };
        const stepA = (maxY - minY) * 0.01;
        const stepD = (maxY - minY) * 0.01;
        const stepB = 0.02;
        const stepC = Math.max((maxX - minX) * 0.01, 0.0001);
        A += (Math.random() - 0.5) * stepA;
        D += (Math.random() - 0.5) * stepD;
        B += (Math.random() - 0.5) * stepB;
        C += (Math.random() - 0.5) * stepC;
        B = Math.max(0.01, B);
        C = Math.max(0.000001, C);
        if (constrained) {
            A = Math.max(minY * 0.5, Math.min(A, maxY));
            D = Math.max(minY, Math.min(D, maxY * 2));
            C = Math.max(minX * 0.1, Math.min(C, maxX * 10));
            B = Math.max(0.01, Math.min(B, 10));
        }
        const current = error();
        if (current < best) {
            best = current;
        } else {
            A = old.A;
            B = old.B;
            C = old.C;
            D = old.D;
        }
    }
    return {
        type: "4pl",
        constrained,
        params: {
            bottom: A,
            hillSlope: B,
            ic50: C,
            top: D
        },
        predict: xv => fourPL(xv, A, B, C, D),
        inverse: yValue => {
            const low = Math.min(A, D);
            const high = Math.max(A, D);
            if (yValue <= low || yValue >= high) return null;
            const denominator = yValue - D;
            if (Math.abs(denominator) < 1e-12) return null;
            const base = (A - yValue) / denominator - 1;
            if (base <= 0) return null;
            return C * Math.pow(base, 1 / B);
        },
        equation:
            `y = ${formatNumber(D)} + (${formatNumber(A)} - ${formatNumber(D)}) / ` +
            `(1 + (x / ${formatNumber(C)})^${formatNumber(B)})`
    };
}
/* ============================================================
   5PL
   ============================================================ */
function fivePL(x, A, B, C, D, G) {
    return D + (A - D) /
        Math.pow(1 + Math.pow(x / C, B), G);
}
function fit5PL(x, y, weighting) {
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    let A = minY;
    let D = maxY;
    let B = 1;
    let C = (Math.min(...x) + Math.max(...x)) / 2;
    let G = 1;
    function error() {
        let total = 0;
        for (let i = 0; i < x.length; i++) {
            const prediction = fivePL(x[i], A, B, C, D, G);
            const w = getWeight(x[i], y[i], weighting);
            total += w * Math.pow(y[i] - prediction, 2);
        }
        return total;
    }
    let best = error();
    for (let i = 0; i < 1000; i++) {
        const old = { A, B, C, D, G };
        A += (Math.random() - 0.5) * (maxY - minY) * 0.01;
        D += (Math.random() - 0.5) * (maxY - minY) * 0.01;
        C += (Math.random() - 0.5) * Math.max(C * 0.02, 0.0001);
        G += (Math.random() - 0.5) * 0.02;
        C = Math.max(C, 0.000001);
        G = Math.max(G, 0.01);
        const current = error();
        if (current < best) {
            best = current;
        } else {
            A = old.A;
            B = old.B;
            C = old.C;
            D = old.D;
            G = old.G;
        }
    }
    return {
        type: "5pl",
        params: {
            bottom: A,
            hillSlope: B,
            ic50: C,
            top: D,
            asymmetry: G
        },
        predict: xv => fivePL(xv, A, B, C, D, G),
        inverse: yValue => {
            if (yValue <= Math.min(A, D) || yValue >= Math.max(A, D)) {
                return null;
            }
            const ratio = (A - D) / (yValue - D);
            if (ratio <= 0 || G <= 0 || B <= 0 || C <= 0) {
                return null;
            }
            const inner = Math.pow(ratio, 1 / G) - 1;
            if (inner <= 0) return null;
            return C * Math.pow(inner, 1 / B);
        },
        equation: "5PL model"
    };
}
/* ============================================================
   MICHAELIS-MENTEN
   ============================================================ */
function fitMichaelisMenten(x, y, weighting) {
    let vmax = Math.max(...y);
    let km = Math.max(...x) / 2;
    for (let iteration = 0; iteration < 2000; iteration++) {
        let gradV = 0;
        let gradK = 0;
        for (let i = 0; i < x.length; i++) {
            const denominator = km + x[i];
            if (denominator <= 0) continue;
            const prediction = vmax * x[i] / denominator;
            const error = prediction - y[i];
            const w = getWeight(x[i], y[i], weighting);
            gradV += 2 * w * error * x[i] / denominator;
            gradK += 2 * w * error * (-vmax * x[i]) /
                (denominator * denominator);
        }
        vmax -= gradV * 0.0001;
        km -= gradK * 0.0001;
        vmax = Math.max(vmax, 0.000001);
        km = Math.max(km, 0.000001);
    }
    return {
        type: "michaelisMenten",
        params: { vmax, km },
        predict: xv => vmax * xv / (km + xv),
        inverse: yValue => {
            if (yValue < 0 || yValue >= vmax) return null;
            return yValue * km / (vmax - yValue);
        },
        equation:
            `y = ${formatNumber(vmax)}x / (${formatNumber(km)} + x)`
    };
}
/* ============================================================
   EXPONENTIAL
   ============================================================ */
function fitExponential(x, y, decay = false) {
    const transformed = y.map(v => Math.max(v, 1e-12));
    const logY = transformed.map(v => Math.log(v));
    const linear = fitLinear(x, logY, "none");
    if (!decay) {
        const A = Math.exp(linear.params.c);
        const k = linear.params.m;
        return {
            type: "expGrowth",
            params: { A, k },
            predict: xv => A * Math.exp(k * xv),
            inverse: yValue =>
                yValue > 0 ? Math.log(yValue / A) / k : null,
            equation:
                `y = ${formatNumber(A)}e^(${formatNumber(k)}x)`
        };
    }
    const A = Math.exp(linear.params.c);
    const k = -linear.params.m;
    return {
        type: "expDecay",
        params: { A, k, offset: 0 },
        predict: xv => A * Math.exp(-k * xv),
        inverse: yValue =>
            yValue > 0 && A > 0 && k !== 0
                ? -Math.log(yValue / A) / k
                : null,
        equation:
            `y = ${formatNumber(A)}e^(-${formatNumber(k)}x)`
    };
}
/* ============================================================
   GAUSSIAN
   ============================================================ */
function fitGaussian(x, y, weighting) {
    let amplitude = Math.max(...y);
    let mean = x[y.indexOf(amplitude)];
    let sd = Math.max((Math.max(...x) - Math.min(...x)) / 4, 0.001);
    function predict(xv) {
        return amplitude *
            Math.exp(-Math.pow(xv - mean, 2) / (2 * sd * sd));
    }
    return {
        type: "gaussian",
        params: {
            amplitude,
            mean,
            sd
        },
        predict,
        // Gaussian generally has two X values for one Y.
        inverse: () => null,
        equation:
            `y = ${formatNumber(amplitude)} exp(-(x-${formatNumber(mean)})² / ` +
            `(2 × ${formatNumber(sd)}²))`
    };
}
/* ============================================================
   MODEL SELECTION
   ============================================================ */
function fitModel(model, x, y, weighting) {
    switch (model) {
        case "4pl_unconstrained":
            return fit4PL(x, y, weighting, false);
        case "4pl_constrained":
            return fit4PL(x, y, weighting, true);
        case "5pl":
            return fit5PL(x, y, weighting);
        case "linear":
            return fitLinear(x, y, weighting);
        case "quadratic":
            return fitPolynomial(x, y, 2, weighting);
        case "cubic":
            return fitPolynomial(x, y, 3, weighting);
        case "michaelisMenten":
            return fitMichaelisMenten(x, y, weighting);
        case "expGrowth":
            return fitExponential(x, y, false);
        case "expDecay":
            return fitExponential(x, y, true);
        case "gaussian":
            return fitGaussian(x, y, weighting);
        default:
            throw new Error("Unknown fit model.");
    }
}
/* ============================================================
   MODEL NAME
   ============================================================ */
function modelName(result) {
    if (!result) return "";
    if (result.type === "4pl") {
        return result.constrained
            ? "4PL (Constrained)"
            : "4PL (Unconstrained)";
    }
    switch (result.type) {
        case "5pl": return "5PL";
        case "linear": return "Linear";
        case "quadratic": return "Quadratic";
        case "cubic": return "Cubic";
        case "michaelisMenten": return "Michaelis-Menten";
        case "expGrowth": return "Exponential Growth";
        case "expDecay": return "Exponential Decay";
        case "gaussian": return "Gaussian";
        default: return result.type;
    }
}
/* ============================================================
   FIT STATISTICS
   ============================================================ */
function calculateFitStats(x, y, result, parameterCount) {
    const predictions = x.map(result.predict);
    const mean = y.reduce((a, b) => a + b, 0) / y.length;
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < y.length; i++) {
        ssTot += Math.pow(y[i] - mean, 2);
        ssRes += Math.pow(y[i] - predictions[i], 2);
    }
    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    return {
        n: x.length,
        r2,
        rmse: Math.sqrt(ssRes / x.length),
        sse: ssRes
    };
}
/* ============================================================
   RESULTS
   ============================================================ */
function displayResults(result) {
    const results = document.getElementById("results");
    const parameters = document.getElementById("parameters");
    const pointCount = document.getElementById("pointCount");
    if (!results || !parameters) return;
    results.classList.remove("hidden");
    if (pointCount) {
        pointCount.textContent = `${lastX.length} Points Fitted`;
    }
    const stats = calculateFitStats(
        lastX,
        lastY,
        result,
        Object.keys(result.params).length
    );
    let html = `
        <div class="parameter-grid" id="parameterGrid">
            <div class="parameter-card">
                <span class="parameter-label">Model</span>
                <strong>${escapeHtml(modelName(result))}</strong>
            </div>
    `;
    for (const [key, value] of Object.entries(result.params)) {
        if (typeof value !== "number") continue;
        html += `
            <div class="parameter-card">
                <span class="parameter-label">${escapeHtml(key)}</span>
                <strong>${formatNumber(value)}</strong>
            </div>
        `;
    }
    html += `
        </div>
        <div class="fit-statistics">
            <div class="parameter-card">
                <span class="parameter-label">R²</span>
                <strong>${formatNumber(stats.r2)}</strong>
            </div>
            <div class="parameter-card">
                <span class="parameter-label">RMSE</span>
                <strong>${formatNumber(stats.rmse)}</strong>
            </div>
        </div>
        <div class="equation">
            <strong>Equation</strong>
            <div>${escapeHtml(result.equation)}</div>
        </div>
    `;
    parameters.innerHTML = html;
    drawChart(result);
    updatePredictions(result);
}
/* ============================================================
   CHART
   ============================================================ */
function drawChart(result) {
    const canvas = document.getElementById("fitChart");
    if (!canvas || typeof Chart === "undefined") return;
    if (fitChart) {
        fitChart.destroy();
    }
    const minX = Math.min(...lastX);
    const maxX = Math.max(...lastX);
    const curve = [];
    for (let i = 0; i <= 100; i++) {
        const x = minX + (maxX - minX) * i / 100;
        curve.push({
            x,
            y: result.predict(x)
        });
    }
    fitChart = new Chart(canvas, {
        type: "scatter",
        data: {
            datasets: [
                {
                    label: "Observed Data",
                    data: lastX.map((x, i) => ({
                        x,
                        y: lastY[i]
                    })),
                    showLine: false
                },
                {
                    label: `Fitted Curve (${modelName(result)})`,
                    data: curve,
                    type: "line",
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear",
                    title: {
                        display: true,
                        text: "Concentration (X)"
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: "Response (Y)"
                    }
                }
            }
        }
    });
}
/* ============================================================
   PREDICTIONS
   ============================================================ */
function updatePredictions(result = lastResult) {
    const tbody = document.querySelector("#predictTable tbody");
    const status = document.getElementById("predictionStatus");
    if (!tbody) return;
    for (const row of tbody.rows) {
        const yText = row.querySelector(".cell-predict-y")?.textContent.trim();
        const output = row.querySelector(".cell-predict-x");
        if (!output) continue;
        if (!yText) {
            output.textContent = "";
            continue;
        }
        const y = Number(yText);
        if (!Number.isFinite(y) || !result || typeof result.inverse !== "function") {
            output.textContent = "N/A";
            continue;
        }
        const x = result.inverse(y);
        output.textContent =
            Number.isFinite(x)
                ? formatNumber(x)
                : "N/A";
    }
    if (!status) return;
    if (!result) {
        status.textContent = "Fit a model to enable predictions.";
    } else if (result.type === "gaussian") {
        status.textContent = "N/A — Gaussian cannot be reliably inverted.";
    } else {
        status.textContent = "Predictions calculated from fitted model.";
    }
}
/* ============================================================
   COPY PREDICTIONS
   ============================================================ */
async function copyPredictions() {
    const tbody = document.querySelector("#predictTable tbody");
    if (!tbody) return;
    const lines = [
        ["Sample", "Response (Y)", "Predicted X"].join("\t")
    ];
    for (const row of tbody.rows) {
        const sample = row.querySelector(".cell-sample")?.textContent.trim();
        const y = row.querySelector(".cell-predict-y")?.textContent.trim();
        const x = row.querySelector(".cell-predict-x")?.textContent.trim();
        if (!sample && !y) continue;
        lines.push([
            sample,
            y,
            x || ""
        ].join("\t"));
    }
    const text = lines.join("\n");
    try {
        await navigator.clipboard.writeText(text);
        const button = document.getElementById("copyPredictionButton");
        if (button) {
            const original = button.textContent;
            button.textContent = "Copied";
            setTimeout(() => {
                button.textContent = original;
            }, 1200);
        }
    } catch (error) {
        console.error("Copy failed:", error);
    }
}
/* ============================================================
   MAIN CALCULATION
   ============================================================ */
function calculate4PL() {
    clearError();
    try {
        const data = getInputData();
        const model = document.getElementById("fitModel")?.value;
        const weighting = document.getElementById("weighting")?.value || "none";
        if (!model) {
            throw new Error("Please select a fit model.");
        }
        if (
            ["4pl_unconstrained", "4pl_constrained", "5pl", "michaelisMenten"]
                .includes(model) &&
            data.x.some(value => value <= 0)
        ) {
            throw new Error(
                "This model requires all concentrations to be greater than zero."
            );
        }
        lastX = data.x;
        lastY = data.y;
        lastResult = fitModel(
            model,
            lastX,
            lastY,
            weighting
        );
        displayResults(lastResult);
    } catch (error) {
        console.error(error);
        showError(error.message);
    }
}
/* ============================================================
   CLEAR
   ============================================================ */
function clearCalculator() {
    clearError();
    const tbody = getInputBody();
    if (tbody) {
        tbody.innerHTML = "";
        for (let i = 0; i < 8; i++) {
            addInputRow();
        }
    }
    const predictBody = document.querySelector("#predictTable tbody");
    if (predictBody) {
        predictBody.innerHTML = "";
        for (let i = 0; i < 8; i++) {
            addPredictionRow();
        }
    }
    lastX = [];
    lastY = [];
    lastResult = null;
    const results = document.getElementById("results");
    if (results) {
        results.classList.add("hidden");
    }
    updateInputCount();
    updatePredictionCount();
    updatePredictions(null);
    if (fitChart) {
        fitChart.destroy();
        fitChart = null;
    }
}
/* ============================================================
   INITIALISE
   ============================================================ */
function initialise() {
    /*
       The original HTML contains a second table with duplicate
       dataTable/dataTableBody IDs.
       Remove that broken second table and create Predict cleanly.
       The first table remains the real input table.
    */
    const tables = document.querySelectorAll(
        ".spreadsheet-wrapper table.spreadsheet"
    );
    if (tables.length > 1) {
        for (let i = 1; i < tables.length; i++) {
            tables[i].remove();
        }
    }
    const inputTable = document.querySelector(
        ".spreadsheet-wrapper table.spreadsheet"
    );
    if (inputTable) {
        inputTable.id = "dataTable";
        const tbody = inputTable.querySelector("tbody");
        if (tbody) {
            tbody.id = "dataTableBody";
        }
    }
    initInputTable(8);
    createPredictionTable();
    initPredictionTable(8);
    const inputTableElement = document.getElementById("dataTable");
    if (inputTableElement) {
        inputTableElement.addEventListener("paste", handleInputPaste);
        inputTableElement.addEventListener("input", () => {
            updateInputCount();
            ensureInputRow();
        });
    }
    const predictionTable = document.getElementById("predictTable");
    if (predictionTable) {
        predictionTable.addEventListener(
            "paste",
            handlePredictionPaste
        );
        predictionTable.addEventListener("input", () => {
            ensurePredictionRow();
            updatePredictionCount();
            updatePredictions();
        });
    }
    document
        .getElementById("calculateButton")
        ?.addEventListener("click", calculate4PL);
    document
        .getElementById("clearButton")
        ?.addEventListener("click", clearCalculator);
    document
        .getElementById("copyPredictionButton")
        ?.addEventListener("click", copyPredictions);
    document
        .getElementById("fitModel")
        ?.addEventListener("change", () => {
            if (lastX.length >= 3) {
                calculate4PL();
            }
        });
    document
        .getElementById("weighting")
        ?.addEventListener("change", () => {
            if (lastX.length >= 3) {
                calculate4PL();
            }
        });
}
/* ============================================================
   START
   ============================================================ */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, {
        once: true
    });
} else {
    initialise();
}
/* Keep calculate4PL available to the page if needed. */
window.calculate4PL = calculate4PL;