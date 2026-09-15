(function () {
    "use strict";
    /*
     * ============================================================
     * LABORATORY 4PL / STANDARD CURVE CALCULATOR
     * ============================================================
     *
     * This file is deliberately wrapped in an IIFE and guarded.
     * The supplied HTML currently loads app.js twice:
     *
     *   <script src="app.js" defer></script>
     *   ...
     *   <script src="app.js"></script>
     *
     * The guard prevents duplicate event listeners / initialisation.
     *
     * ============================================================
     */
    if (window.__labCalculatorScriptLoaded) {
        return;
    }
    window.__labCalculatorScriptLoaded = true;
    let lastX = null;
    let lastY = null;
    let lastResult = null;
    let myFitChart = null;
    /* ============================================================
       GENERAL HELPERS
       ============================================================ */
    function formatNumber(value, significant = 8) {
        if (value === null || value === undefined || !Number.isFinite(value)) {
            return "N/A";
        }
        if (value === 0) {
            return "0";
        }
        return Number(value).toPrecision(significant).replace(/\.?0+e/, "e");
    }
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function isFiniteNumber(value) {
        return Number.isFinite(Number(value));
    }
    function parseNumber(value) {
        if (value === null || value === undefined) {
            return NaN;
        }
        const cleaned = String(value)
            .trim()
            .replace(/,/g, "");
        if (cleaned === "") {
            return NaN;
        }
        const number = Number(cleaned);
        return Number.isFinite(number) ? number : NaN;
    }
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    function arraysHaveAtLeastTwoUniqueValues(values) {
        return new Set(values.map(v => Number(v))).size >= 2;
    }
    function showError(message) {
        const errorElement = document.getElementById("inputError");
        if (!errorElement) {
            console.error(message);
            return;
        }
        errorElement.textContent = message;
        errorElement.classList.remove("hidden");
    }
    function clearError() {
        const errorElement = document.getElementById("inputError");
        if (errorElement) {
            errorElement.textContent = "";
            errorElement.classList.add("hidden");
        }
    }
    /* ============================================================
       SPREADSHEET TABLE SETUP
       ============================================================ */
    function createPredictionTable(wrapper) {
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
            <tbody id="predictTableBody"></tbody>
        `;
        wrapper.appendChild(table);
        return table;
    }
    function buildPredictionHeader(table) {
        if (!table) {
            return;
        }
        const existingBody = table.querySelector("tbody");
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
        `;
        if (existingBody) {
            existingBody.id = "predictTableBody";
            table.appendChild(existingBody);
        } else {
            const tbody = document.createElement("tbody");
            tbody.id = "predictTableBody";
            table.appendChild(tbody);
        }
    }
    function addPredictionUI(wrapper, table) {
        if (!wrapper || !table) {
            return;
        }
        /*
         * Remove the stray literal "Predict" text from the supplied
         * HTML if it exists as a direct text node.
         */
        Array.from(wrapper.childNodes).forEach(node => {
            if (
                node.nodeType === Node.TEXT_NODE &&
                node.textContent.trim().toLowerCase() === "predict"
            ) {
                node.remove();
            }
        });
        if (!document.getElementById("predictionTitle")) {
            const heading = document.createElement("div");
            heading.id = "predictionTitle";
            heading.className = "section-header";
            heading.style.marginTop = "28px";
            heading.innerHTML = `
                <div>
                    <h2>Predict</h2>
                    <p class="section-description">
                        Enter sample responses to calculate predicted concentrations.
                    </p>
                </div>
            `;
            table.parentNode.insertBefore(heading, table);
        }
        if (!document.getElementById("predictionFooter")) {
            const footer = document.createElement("div");
            footer.id = "predictionFooter";
            footer.className = "table-footer";
            footer.innerHTML = `
                <span id="predictCount">0 samples</span>
                <span id="predictionStatus">
                    Fit a model to enable predictions.
                </span>
                <button
                    id="copyPredictionButton"
                    type="button"
                    class="btn-copy-mini"
                >
                    Copy
                </button>
            `;
            table.parentNode.insertBefore(
                footer,
                table.nextSibling
            );
        }
    }
    function normaliseSpreadsheetTables() {
        const wrapper = document.querySelector(".spreadsheet-wrapper");
        if (!wrapper) {
            return;
        }
        let tables = Array.from(
            wrapper.querySelectorAll("table.spreadsheet")
        );
        /*
         * The first spreadsheet is always treated as the standard
         * curve input table.
         */
        let standardTable =
            tables.find(table => table.id === "dataTable") ||
            tables[0];
        if (!standardTable) {
            standardTable = document.createElement("table");
            standardTable.className = "spreadsheet";
            standardTable.innerHTML = `
                <thead>
                    <tr>
                        <th class="corner-cell"></th>
                        <th class="column-letter">A</th>
                        <th class="column-letter">B</th>
                    </tr>
                    <tr class="header-row">
                        <th class="row-number"></th>
                        <th>Concentration (X)</th>
                        <th>Response (Y)</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            wrapper.insertBefore(
                standardTable,
                wrapper.firstChild
            );
        }
        standardTable.id = "dataTable";
        /*
         * Find the second table.
         *
         * The supplied HTML currently contains a second table with
         * duplicate IDs. We deliberately identify it by its position
         * rather than getElementById(), which would otherwise return
         * the wrong tbody.
         */
        tables = Array.from(
            wrapper.querySelectorAll("table.spreadsheet")
        );
        let predictionTable = tables.find(
            table =>
                table !== standardTable &&
                (
                    /sample/i.test(table.textContent) ||
                    /predict/i.test(table.textContent)
                )
        );
        if (!predictionTable) {
            predictionTable = tables.find(
                table => table !== standardTable
            );
        }
        if (!predictionTable) {
            predictionTable = createPredictionTable(wrapper);
        }
        /*
         * Make sure the prediction table is a direct child of the
         * spreadsheet wrapper. This also repairs malformed/nested
         * HTML from the current page.
         */
        if (predictionTable.parentElement !== wrapper) {
            wrapper.appendChild(predictionTable);
        }
        predictionTable.id = "predictTable";
        /*
         * Standard tbody.
         *
         * IMPORTANT:
         * We do not replace or destroy the standard table here.
         * initSpreadsheet() will deliberately populate it afterwards.
         */
        let standardBody = standardTable.querySelector("tbody");
        if (!standardBody) {
            standardBody = document.createElement("tbody");
            standardTable.appendChild(standardBody);
        }
        standardBody.id = "dataTableBody";
        /*
         * Prediction tbody.
         */
        let predictionBody = predictionTable.querySelector("tbody");
        if (!predictionBody) {
            predictionBody = document.createElement("tbody");
            predictionTable.appendChild(predictionBody);
        }
        predictionBody.id = "predictTableBody";
        buildPredictionHeader(predictionTable);
        addPredictionUI(wrapper, predictionTable);
    }
    /* ============================================================
       STANDARD CURVE SPREADSHEET
       ============================================================ */
    function initSpreadsheet(rowCount = 8) {
        const tbody = document.getElementById("dataTableBody");
        if (!tbody) {
            return;
        }
        tbody.innerHTML = "";
        for (let i = 0; i < rowCount; i++) {
            addSpreadsheetRow(tbody, i + 1);
        }
        updateDataCount();
    }
    function addSpreadsheetRow(
        tbody,
        rowNum,
        xVal = "",
        yVal = ""
    ) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="row-number">${rowNum}</td>
            <td
                contenteditable="true"
                class="cell cell-x"
                spellcheck="false"
            >${escapeHtml(xVal)}</td>
            <td
                contenteditable="true"
                class="cell cell-y"
                spellcheck="false"
            >${escapeHtml(yVal)}</td>
        `;
        tbody.appendChild(tr);
    }
    function renumberStandardRows() {
        const rows = document.querySelectorAll(
            "#dataTableBody tr"
        );
        rows.forEach((row, index) => {
            const numberCell = row.querySelector(".row-number");
            if (numberCell) {
                numberCell.textContent = String(index + 1);
            }
        });
    }
    function ensureStandardRows() {
        const tbody = document.getElementById("dataTableBody");
        if (!tbody) {
            return;
        }
        const rows = Array.from(tbody.querySelectorAll("tr"));
        if (rows.length === 0) {
            addSpreadsheetRow(tbody, 1);
            return;
        }
        const lastRow = rows[rows.length - 1];
        const x = lastRow.querySelector(".cell-x");
        const y = lastRow.querySelector(".cell-y");
        if (
            (x && x.textContent.trim() !== "") ||
            (y && y.textContent.trim() !== "")
        ) {
            addSpreadsheetRow(
                tbody,
                rows.length + 1
            );
        }
    }
    function parseSpreadsheetTable() {
        const rows = document.querySelectorAll(
            "#dataTableBody tr"
        );
        const xValues = [];
        const yValues = [];
        rows.forEach(row => {
            const xCell = row.querySelector(".cell-x");
            const yCell = row.querySelector(".cell-y");
            if (!xCell || !yCell) {
                return;
            }
            const xText = xCell.textContent.trim();
            const yText = yCell.textContent.trim();
            if (xText === "" && yText === "") {
                return;
            }
            const x = parseNumber(xText);
            const y = parseNumber(yText);
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                throw new Error(
                    "Every populated standard-curve row must contain numeric X and Y values."
                );
            }
            xValues.push(x);
            yValues.push(y);
        });
        if (xValues.length < 3) {
            throw new Error(
                "At least three valid data pairs are required."
            );
        }
        if (!arraysHaveAtLeastTwoUniqueValues(xValues)) {
            throw new Error(
                "At least two different concentration values are required."
            );
        }
        return {
            xValues,
            yValues
        };
    }
    /* ============================================================
       WEIGHTING
       ============================================================ */
    function getWeight(x, y, weighting) {
        switch (weighting) {
            case "invY":
                return y === 0
                    ? 1
                    : 1 / Math.abs(y);
            case "invY2":
                return y === 0
                    ? 1
                    : 1 / (y * y);
            case "invX":
                return x === 0
                    ? 1
                    : 1 / Math.abs(x);
            case "invX2":
                return x === 0
                    ? 1
                    : 1 / (x * x);
            case "none":
            default:
                return 1;
        }
    }
    function getWeights(xValues, yValues, weighting) {
        return xValues.map(
            (x, i) => getWeight(x, yValues[i], weighting)
        );
    }
    /* ============================================================
       MATRIX SOLVER
       ============================================================ */
    function solveMatrix(A, B) {
        const n = A.length;
        const matrix = A.map(
            (row, i) => [
                ...row,
                B[i]
            ]
        );
        for (let col = 0; col < n; col++) {
            let pivotRow = col;
            for (let row = col + 1; row < n; row++) {
                if (
                    Math.abs(matrix[row][col]) >
                    Math.abs(matrix[pivotRow][col])
                ) {
                    pivotRow = row;
                }
            }
            if (
                Math.abs(matrix[pivotRow][col]) <
                1e-14
            ) {
                throw new Error(
                    "The selected model could not be fitted because the data are singular."
                );
            }
            [
                matrix[col],
                matrix[pivotRow]
            ] = [
                matrix[pivotRow],
                matrix[col]
            ];
            const pivot = matrix[col][col];
            for (let j = col; j <= n; j++) {
                matrix[col][j] /= pivot;
            }
            for (let row = 0; row < n; row++) {
                if (row === col) {
                    continue;
                }
                const factor = matrix[row][col];
                for (let j = col; j <= n; j++) {
                    matrix[row][j] -=
                        factor * matrix[col][j];
                }
            }
        }
        return matrix.map(row => row[n]);
    }
    /* ============================================================
       LINEAR
       ============================================================ */
    function fitLinear(
        xValues,
        yValues,
        weights
    ) {
        let sw = 0;
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let sxy = 0;
        for (let i = 0; i < xValues.length; i++) {
            const w = weights[i];
            const x = xValues[i];
            const y = yValues[i];
            sw += w;
            sx += w * x;
            sy += w * y;
            sxx += w * x * x;
            sxy += w * x * y;
        }
        const denominator =
            sw * sxx - sx * sx;
        if (Math.abs(denominator) < 1e-14) {
            throw new Error(
                "Linear model could not be fitted."
            );
        }
        const slope =
            (sw * sxy - sx * sy) /
            denominator;
        const intercept =
            (sy - slope * sx) /
            sw;
        return {
            type: "linear",
            params: {
                slope,
                intercept
            },
            predict(x) {
                return slope * x + intercept;
            },
            inverse(y) {
                if (Math.abs(slope) < 1e-14) {
                    return null;
                }
                return (
                    (y - intercept) /
                    slope
                );
            },
            equation:
                `y = ${formatNumber(slope)}x + ${formatNumber(intercept)}`
        };
    }
    /* ============================================================
       POLYNOMIAL FIT
       ============================================================ */
    function fitPolynomial(
        xValues,
        yValues,
        weights,
        degree
    ) {
        const size = degree + 1;
        const A = Array.from(
            { length: size },
            () => Array(size).fill(0)
        );
        const B = Array(size).fill(0);
        for (let i = 0; i < xValues.length; i++) {
            const x = xValues[i];
            const y = yValues[i];
            const w = weights[i];
            const powers = Array(
                degree * 2 + 1
            ).fill(1);
            for (let p = 1; p < powers.length; p++) {
                powers[p] =
                    powers[p - 1] * x;
            }
            for (let row = 0; row < size; row++) {
                for (
                    let col = 0;
                    col < size;
                    col++
                ) {
                    A[row][col] +=
                        w * powers[row + col];
                }
                B[row] +=
                    w *
                    y *
                    powers[row];
            }
        }
        const coefficients =
            solveMatrix(A, B);
        const predict = x => {
            let result = 0;
            for (
                let i = coefficients.length - 1;
                i >= 0;
                i--
            ) {
                result =
                    result * x +
                    coefficients[i];
            }
            return result;
        };
        return {
            coefficients,
            predict
        };
    }
    function fitQuadratic(
        xValues,
        yValues,
        weights
    ) {
        const fit = fitPolynomial(
            xValues,
            yValues,
            weights,
            2
        );
        const [
            a,
            b,
            c
        ] = fit.coefficients;
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        return {
            type: "quadratic",
            params: {
                a,
                b,
                c
            },
            predict: fit.predict,
            inverse(y) {
                if (Math.abs(a) < 1e-14) {
                    if (Math.abs(b) < 1e-14) {
                        return null;
                    }
                    const x =
                        (y - c) / b;
                    return (
                        x >= minX - 1e-10 &&
                        x <= maxX + 1e-10
                    )
                        ? x
                        : null;
                }
                const discriminant =
                    b * b -
                    4 * a * (c - y);
                if (discriminant < -1e-12) {
                    return null;
                }
                const sqrtD =
                    Math.sqrt(
                        Math.max(
                            0,
                            discriminant
                        )
                    );
                const roots = [
                    (-b + sqrtD) / (2 * a),
                    (-b - sqrtD) / (2 * a)
                ];
                const candidates = roots.filter(
                    x =>
                        Number.isFinite(x) &&
                        x >= minX - 1e-10 &&
                        x <= maxX + 1e-10
                );
                const unique = [];
                candidates.forEach(x => {
                    if (
                        !unique.some(
                            existing =>
                                Math.abs(existing - x) <
                                1e-8
                        )
                    ) {
                        unique.push(x);
                    }
                });
                return unique.length === 1
                    ? unique[0]
                    : null;
            },
            equation:
                `y = ${formatNumber(a)}x² + ${formatNumber(b)}x + ${formatNumber(c)}`
        };
    }
    function fitCubic(
        xValues,
        yValues,
        weights
    ) {
        const fit = fitPolynomial(
            xValues,
            yValues,
            weights,
            3
        );
        const [
            a,
            b,
            c,
            d
        ] = fit.coefficients;
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        function derivative(x) {
            return (
                3 * a * x * x +
                2 * b * x +
                c
            );
        }
        function isMonotonic() {
            let previousSign = 0;
            const samples = 101;
            for (let i = 0; i < samples; i++) {
                const fraction =
                    i / (samples - 1);
                const x =
                    minX +
                    fraction *
                    (maxX - minX);
                const slope =
                    derivative(x);
                if (Math.abs(slope) < 1e-10) {
                    continue;
                }
                const sign =
                    slope > 0 ? 1 : -1;
                if (
                    previousSign !== 0 &&
                    sign !== previousSign
                ) {
                    return false;
                }
                previousSign = sign;
            }
            return previousSign !== 0;
        }
        const monotonic =
            isMonotonic();
        return {
            type: "cubic",
            params: {
                a,
                b,
                c,
                d
            },
            predict: fit.predict,
            inverse(y) {
                if (!monotonic) {
                    return null;
                }
                let lo = minX;
                let hi = maxX;
                const yLo = fit.predict(lo);
                const yHi = fit.predict(hi);
                const lower =
                    Math.min(yLo, yHi);
                const upper =
                    Math.max(yLo, yHi);
                if (
                    y < lower - 1e-10 ||
                    y > upper + 1e-10
                ) {
                    return null;
                }
                for (let i = 0; i < 80; i++) {
                    const mid =
                        (lo + hi) / 2;
                    const yMid =
                        fit.predict(mid);
                    if (
                        Math.abs(yMid - y) <
                        1e-10
                    ) {
                        return mid;
                    }
                    if (yLo < yHi) {
                        if (yMid < y) {
                            lo = mid;
                        } else {
                            hi = mid;
                        }
                    } else {
                        if (yMid > y) {
                            lo = mid;
                        } else {
                            hi = mid;
                        }
                    }
                }
                return (lo + hi) / 2;
            },
            equation:
                `y = ${formatNumber(a)}x³ + ${formatNumber(b)}x² + ${formatNumber(c)}x + ${formatNumber(d)}`
        };
    }
    /* ============================================================
       4PL
       ============================================================ */
    function fit4PL(
        xValues,
        yValues,
        weights,
        constrained = false
    ) {
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        let A = minY * 0.9;
        let B = 1;
        let C =
            (minX + maxX) / 2;
        let D = maxY * 1.1;
        if (C <= 0) {
            C = Math.max(
                minX,
                1e-12
            );
        }
        function predictWithParams(
            x,
            a,
            b,
            c,
            d
        ) {
            const ratio =
                Math.max(x, 1e-12) /
                Math.max(c, 1e-12);
            return (
                d +
                (a - d) /
                (
                    1 +
                    Math.pow(
                        ratio,
                        b
                    )
                )
            );
        }
        function error(
            a,
            b,
            c,
            d
        ) {
            let total = 0;
            for (
                let i = 0;
                i < xValues.length;
                i++
            ) {
                const predicted =
                    predictWithParams(
                        xValues[i],
                        a,
                        b,
                        c,
                        d
                    );
                const residual =
                    predicted -
                    yValues[i];
                total +=
                    weights[i] *
                    residual *
                    residual;
            }
            return total;
        }
        let currentError =
            error(A, B, C, D);
        for (let iteration = 0; iteration < 3000; iteration++) {
            const stepA =
                Math.max(
                    Math.abs(maxY - minY) * 0.01,
                    1e-8
                );
            const stepB = 0.03;
            const stepC =
                Math.max(
                    Math.abs(maxX - minX) * 0.01,
                    Math.abs(C) * 0.01,
                    1e-8
                );
            const stepD =
                Math.max(
                    Math.abs(maxY - minY) * 0.01,
                    1e-8
                );
            const candidates = [
                [A + stepA, B, C, D],
                [A - stepA, B, C, D],
                [A, B + stepB, C, D],
                [A, B - stepB, C, D],
                [A, B, C + stepC, D],
                [A, B, C - stepC, D],
                [A, B, C, D + stepD],
                [A, B, C, D - stepD]
            ];
            let improved = false;
            for (
                const candidate of candidates
            ) {
                let [
                    a2,
                    b2,
                    c2,
                    d2
                ] = candidate;
                if (constrained) {
                    a2 = clamp(
                        a2,
                        minY * 0.5,
                        maxY
                    );
                    b2 = clamp(
                        b2,
                        0.01,
                        10
                    );
                    c2 = clamp(
                        c2,
                        Math.max(
                            minX * 0.1,
                            1e-12
                        ),
                        maxX * 10
                    );
                    d2 = clamp(
                        d2,
                        minY,
                        maxY * 2
                    );
                } else {
                    b2 = Math.max(
                        0.01,
                        b2
                    );
                    c2 = Math.max(
                        1e-12,
                        c2
                    );
                }
                const candidateError =
                    error(
                        a2,
                        b2,
                        c2,
                        d2
                    );
                if (
                    candidateError <
                    currentError
                ) {
                    A = a2;
                    B = b2;
                    C = c2;
                    D = d2;
                    currentError =
                        candidateError;
                    improved = true;
                }
            }
            if (!improved) {
                /*
                 * Small random-ish local step reduction is not
                 * necessary here. Stop when coordinate descent
                 * cannot improve the fit.
                 */
                break;
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
            predict(x) {
                return predictWithParams(
                    x,
                    A,
                    B,
                    C,
                    D
                );
            },
            inverse(y) {
                const lower =
                    Math.min(A, D);
                const upper =
                    Math.max(A, D);
                if (
                    y <= lower ||
                    y >= upper
                ) {
                    return null;
                }
                const denominator =
                    y - D;
                if (
                    Math.abs(denominator) <
                    1e-14
                ) {
                    return null;
                }
                const base =
                    (A - D) /
                    denominator -
                    1;
                if (
                    !Number.isFinite(base) ||
                    base <= 0 ||
                    B <= 0 ||
                    C <= 0
                ) {
                    return null;
                }
                const x =
                    C *
                    Math.pow(
                        base,
                        1 / B
                    );
                return Number.isFinite(x)
                    ? x
                    : null;
            },
            equation:
                `y = ${formatNumber(D)} + (${formatNumber(A)} - ${formatNumber(D)}) / (1 + (x / ${formatNumber(C)})^${formatNumber(B)})`
        };
    }
    /* ============================================================
       5PL
       ============================================================ */
    function fit5PL(
        xValues,
        yValues,
        weights
    ) {
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        let A = minY;
        let B = 1;
        let C =
            Math.max(
                (minX + maxX) / 2,
                1e-12
            );
        let D = maxY;
        let G = 1;
        function predictWithParams(
            x,
            a,
            b,
            c,
            d,
            g
        ) {
            return (
                d +
                (a - d) /
                Math.pow(
                    1 +
                    Math.pow(
                        Math.max(x, 1e-12) /
                        Math.max(c, 1e-12),
                        b
                    ),
                    g
                )
            );
        }
        function error(
            a,
            b,
            c,
            d,
            g
        ) {
            let total = 0;
            for (
                let i = 0;
                i < xValues.length;
                i++
            ) {
                const predicted =
                    predictWithParams(
                        xValues[i],
                        a,
                        b,
                        c,
                        d,
                        g
                    );
                const residual =
                    predicted -
                    yValues[i];
                total +=
                    weights[i] *
                    residual *
                    residual;
            }
            return total;
        }
        let currentError =
            error(
                A,
                B,
                C,
                D,
                G
            );
        for (let iteration = 0; iteration < 250; iteration++) {
            const rangeY =
                Math.max(
                    Math.abs(maxY - minY),
                    1e-8
                );
            const stepA =
                rangeY * 0.01;
            const stepC =
                Math.max(
                    Math.abs(maxX - minX) * 0.01,
                    C * 0.01,
                    1e-8
                );
            const stepD =
                rangeY * 0.01;
            const stepG = 0.02;
            const candidates = [
                [A + stepA, B, C, D, G],
                [A - stepA, B, C, D, G],
                [A, B, C + stepC, D, G],
                [A, B, C - stepC, D, G],
                [A, B, C, D + stepD, G],
                [A, B, C, D - stepD, G],
                [A, B, C, D, G + stepG],
                [A, B, C, D, G - stepG]
            ];
            let improved = false;
            for (
                const candidate of candidates
            ) {
                let [
                    a2,
                    b2,
                    c2,
                    d2,
                    g2
                ] = candidate;
                c2 = Math.max(
                    1e-12,
                    c2
                );
                b2 = Math.max(
                    0.01,
                    b2
                );
                g2 = Math.max(
                    0.01,
                    g2
                );
                const candidateError =
                    error(
                        a2,
                        b2,
                        c2,
                        d2,
                        g2
                    );
                if (
                    candidateError <
                    currentError
                ) {
                    A = a2;
                    B = b2;
                    C = c2;
                    D = d2;
                    G = g2;
                    currentError =
                        candidateError;
                    improved = true;
                }
            }
            if (!improved) {
                break;
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
            predict(x) {
                return predictWithParams(
                    x,
                    A,
                    B,
                    C,
                    D,
                    G
                );
            },
            inverse(y) {
                const lower =
                    Math.min(A, D);
                const upper =
                    Math.max(A, D);
                if (
                    y <= lower ||
                    y >= upper
                ) {
                    return null;
                }
                if (
                    B <= 0 ||
                    C <= 0 ||
                    G <= 0
                ) {
                    return null;
                }
                const ratio =
                    (A - D) /
                    (y - D);
                if (
                    !Number.isFinite(ratio) ||
                    ratio <= 0
                ) {
                    return null;
                }
                const inner =
                    Math.pow(
                        ratio,
                        1 / G
                    ) - 1;
                if (
                    !Number.isFinite(inner) ||
                    inner <= 0
                ) {
                    return null;
                }
                const x =
                    C *
                    Math.pow(
                        inner,
                        1 / B
                    );
                return Number.isFinite(x)
                    ? x
                    : null;
            },
            equation:
                `y = ${formatNumber(D)} + (${formatNumber(A)} - ${formatNumber(D)}) / (1 + (x / ${formatNumber(C)})^${formatNumber(B)})^${formatNumber(G)}`
        };
    }
    /* ============================================================
       MICHAELIS-MENTEN
       ============================================================ */
    function fitMichaelisMenten(
        xValues,
        yValues,
        weights
    ) {
        let Vmax =
            Math.max(...yValues);
        let Km =
            Math.max(
                (
                    Math.min(...xValues) +
                    Math.max(...xValues)
                ) / 2,
                1e-12
            );
        function predictWithParams(
            x,
            vmax,
            km
        ) {
            return (
                vmax * x /
                (km + x)
            );
        }
        function error(
            vmax,
            km
        ) {
            let total = 0;
            for (
                let i = 0;
                i < xValues.length;
                i++
            ) {
                const residual =
                    predictWithParams(
                        xValues[i],
                        vmax,
                        km
                    ) -
                    yValues[i];
                total +=
                    weights[i] *
                    residual *
                    residual;
            }
            return total;
        }
        let currentError =
            error(Vmax, Km);
        for (let i = 0; i < 1500; i++) {
            const stepV =
                Math.max(
                    Math.abs(Vmax) * 0.01,
                    1e-8
                );
            const stepK =
                Math.max(
                    Math.abs(Km) * 0.01,
                    1e-8
                );
            const candidates = [
                [
                    Vmax + stepV,
                    Km
                ],
                [
                    Vmax - stepV,
                    Km
                ],
                [
                    Vmax,
                    Km + stepK
                ],
                [
                    Vmax,
                    Km - stepK
                ]
            ];
            let improved = false;
            for (
                const candidate of candidates
            ) {
                const v =
                    candidate[0];
                const k =
                    Math.max(
                        candidate[1],
                        1e-12
                    );
                const candidateError =
                    error(v, k);
                if (
                    candidateError <
                    currentError
                ) {
                    Vmax = v;
                    Km = k;
                    currentError =
                        candidateError;
                    improved = true;
                }
            }
            if (!improved) {
                break;
            }
        }
        return {
            type: "michaelisMenten",
            params: {
                vmax: Vmax,
                km: Km
            },
            predict(x) {
                return predictWithParams(
                    x,
                    Vmax,
                    Km
                );
            },
            inverse(y) {
                if (
                    y < 0 ||
                    y >= Vmax
                ) {
                    return null;
                }
                return (
                    y * Km /
                    (Vmax - y)
                );
            },
            equation:
                `y = ${formatNumber(Vmax)}x / (${formatNumber(Km)} + x)`
        };
    }
    /* ============================================================
       EXPONENTIAL GROWTH
       ============================================================ */
    function fitExpGrowth(
        xValues,
        yValues,
        weights
    ) {
        const transformedY =
            yValues.map(
                y =>
                    Math.log(
                        Math.max(y, 1e-12)
                    )
            );
        const fit =
            fitLinear(
                xValues,
                transformedY,
                weights
            );
        const A =
            Math.exp(
                fit.params.intercept
            );
        const k =
            fit.params.slope;
        return {
            type: "expGrowth",
            params: {
                amplitude: A,
                rate: k
            },
            predict(x) {
                return (
                    A *
                    Math.exp(k * x)
                );
            },
            inverse(y) {
                if (
                    y <= 0 ||
                    A <= 0 ||
                    Math.abs(k) < 1e-14
                ) {
                    return null;
                }
                return (
                    Math.log(y / A) /
                    k
                );
            },
            equation:
                `y = ${formatNumber(A)}e^(${formatNumber(k)}x)`
        };
    }
    /* ============================================================
       EXPONENTIAL DECAY
       ============================================================ */
    function fitExpDecay(
        xValues,
        yValues,
        weights
    ) {
        const offset =
            Math.min(...yValues);
        const transformedY =
            yValues.map(
                y =>
                    Math.log(
                        Math.max(
                            y - offset,
                            1e-12
                        )
                    )
            );
        const fit =
            fitLinear(
                xValues,
                transformedY,
                weights
            );
        const A =
            Math.exp(
                fit.params.intercept
            );
        const k =
            -fit.params.slope;
        return {
            type: "expDecay",
            params: {
                amplitude: A,
                rate: k,
                offset
            },
            predict(x) {
                return (
                    A *
                    Math.exp(-k * x) +
                    offset
                );
            },
            inverse(y) {
                if (
                    A <= 0 ||
                    Math.abs(k) < 1e-14
                ) {
                    return null;
                }
                const inner =
                    (y - offset) /
                    A;
                if (
                    inner <= 0 ||
                    inner > 1
                ) {
                    return null;
                }
                return (
                    -Math.log(inner) /
                    k
                );
            },
            equation:
                `y = ${formatNumber(A)}e^(-${formatNumber(k)}x) + ${formatNumber(offset)}`
        };
    }
    /* ============================================================
       GAUSSIAN
       ============================================================ */
    function fitGaussian(
        xValues,
        yValues,
        weights
    ) {
        let amplitude =
            Math.max(...yValues);
        let weightedX = 0;
        let weightTotal = 0;
        for (
            let i = 0;
            i < xValues.length;
            i++
        ) {
            const weight =
                Math.max(
                    yValues[i],
                    0
                ) *
                weights[i];
            weightedX +=
                xValues[i] *
                weight;
            weightTotal +=
                weight;
        }
        let mean =
            weightTotal > 0
                ? weightedX / weightTotal
                : (
                    Math.min(...xValues) +
                    Math.max(...xValues)
                ) / 2;
        let variance = 0;
        for (
            let i = 0;
            i < xValues.length;
            i++
        ) {
            const diff =
                xValues[i] -
                mean;
            variance +=
                weights[i] *
                Math.max(
                    yValues[i],
                    0
                ) *
                diff *
                diff;
        }
        let sd =
            weightTotal > 0
                ? Math.sqrt(
                    variance /
                    weightTotal
                )
                : 1;
        sd = Math.max(
            sd,
            1e-12
        );
        function predictWithParams(
            x,
            amp,
            m,
            s
        ) {
            return (
                amp *
                Math.exp(
                    -Math.pow(
                        x - m,
                        2
                    ) /
                    (
                        2 *
                        s *
                        s
                    )
                )
            );
        }
        function error(
            amp,
            m,
            s
        ) {
            let total = 0;
            for (
                let i = 0;
                i < xValues.length;
                i++
            ) {
                const residual =
                    predictWithParams(
                        xValues[i],
                        amp,
                        m,
                        s
                    ) -
                    yValues[i];
                total +=
                    weights[i] *
                    residual *
                    residual;
            }
            return total;
        }
        let currentError =
            error(
                amplitude,
                mean,
                sd
            );
        for (let i = 0; i < 1000; i++) {
            const stepA =
                Math.max(
                    Math.abs(amplitude) * 0.01,
                    1e-8
                );
            const stepM =
                Math.max(
                    Math.abs(
                        Math.max(...xValues) -
                        Math.min(...xValues)
                    ) * 0.01,
                    1e-8
                );
            const stepS =
                Math.max(
                    sd * 0.01,
                    1e-8
                );
            const candidates = [
                [amplitude + stepA, mean, sd],
                [amplitude - stepA, mean, sd],
                [amplitude, mean + stepM, sd],
                [amplitude, mean - stepM, sd],
                [amplitude, mean, sd + stepS],
                [amplitude, mean, sd - stepS]
            ];
            let improved = false;
            for (
                const candidate of candidates
            ) {
                const amp =
                    Math.max(
                        candidate[0],
                        1e-12
                    );
                const m =
                    candidate[1];
                const s =
                    Math.max(
                        candidate[2],
                        1e-12
                    );
                const candidateError =
                    error(
                        amp,
                        m,
                        s
                    );
                if (
                    candidateError <
                    currentError
                ) {
                    amplitude = amp;
                    mean = m;
                    sd = s;
                    currentError =
                        candidateError;
                    improved = true;
                }
            }
            if (!improved) {
                break;
            }
        }
        return {
            type: "gaussian",
            params: {
                amplitude,
                mean,
                sd
            },
            predict(x) {
                return predictWithParams(
                    x,
                    amplitude,
                    mean,
                    sd
                );
            },
            /*
             * A Gaussian normally has two possible X values for
             * the same response. Therefore we deliberately do not
             * provide an automatic inverse.
             */
            inverse() {
                return null;
            },
            equation:
                `y = ${formatNumber(amplitude)} exp(-(x - ${formatNumber(mean)})² / (2 × ${formatNumber(sd)}²))`
        };
    }
    /* ============================================================
       FIT STATISTICS
       ============================================================ */
    function calculateFitStats(
        xValues,
        yValues,
        result,
        parameterCount,
        weights
    ) {
        const n =
            yValues.length;
        const k =
            parameterCount;
        const dof =
            Math.max(
                1,
                n - k
            );
        const predictions =
            xValues.map(
                x => result.predict(x)
            );
        const meanY =
            yValues.reduce(
                (sum, y) => sum + y,
                0
            ) / n;
        let ssTot = 0;
        let ssRes = 0;
        for (
            let i = 0;
            i < n;
            i++
        ) {
            ssTot +=
                Math.pow(
                    yValues[i] - meanY,
                    2
                );
            ssRes +=
                weights[i] *
                Math.pow(
                    yValues[i] -
                    predictions[i],
                    2
                );
        }
        const r2 =
            ssTot === 0
                ? 1
                : 1 - ssRes / ssTot;
        const adjustedR2 =
            n > k + 1
                ? 1 -
                    (
                        1 - r2
                    ) *
                    (
                        (n - 1) /
                        (n - k - 1)
                    )
                : NaN;
        const se =
            Math.sqrt(
                ssRes / dof
            );
        const sse =
            ssRes;
        const fStat =
            (
                k > 0 &&
                ssTot > 0
            )
                ? (
                    ((ssTot - ssRes) / k) /
                    (ssRes / dof)
                )
                : NaN;
        /*
         * This is the same simplified p-value approach used by
         * the existing calculator. It is not intended as a formal
         * regression-distribution implementation.
         */
        const pValue =
            Number.isFinite(fStat)
                ? Math.exp(-0.5 * fStat)
                : NaN;
        const logLikelihood =
            n > 0 && ssRes > 0
                ? -0.5 *
                    n *
                    (
                        Math.log(
                            2 * Math.PI *
                            ssRes / n
                        ) + 1
                    )
                : NaN;
        const aic =
            Number.isFinite(logLikelihood)
                ? 2 * k -
                    2 * logLikelihood
                : NaN;
        const bic =
            Number.isFinite(logLikelihood)
                ? Math.log(n) * k -
                    2 * logLikelihood
                : NaN;
        const aicc =
            n - k - 1 > 0
                ? aic +
                    (
                        2 * k *
                        (k + 1)
                    ) /
                    (
                        n - k - 1
                    )
                : NaN;
        return {
            n,
            k,
            dof,
            r2,
            adjustedR2,
            se,
            sse,
            fStat,
            pValue,
            aic,
            bic,
            aicc
        };
    }
    /* ============================================================
       MODEL SELECTION
       ============================================================ */
    function fitSelectedModel(
        modelType,
        xValues,
        yValues,
        weighting
    ) {
        const weights =
            getWeights(
                xValues,
                yValues,
                weighting
            );
        if (
            (
                modelType ===
                    "4pl_unconstrained" ||
                modelType ===
                    "4pl_constrained" ||
                modelType === "5pl" ||
                modelType === "michaelisMenten"
            ) &&
            xValues.some(
                x => x <= 0
            )
        ) {
            throw new Error(
                "This model requires all concentration values to be greater than zero."
            );
        }
        switch (modelType) {
            case "4pl_unconstrained":
                return {
                    result: fit4PL(
                        xValues,
                        yValues,
                        weights,
                        false
                    ),
                    parameterCount: 4
                };
            case "4pl_constrained":
                return {
                    result: fit4PL(
                        xValues,
                        yValues,
                        weights,
                        true
                    ),
                    parameterCount: 4
                };
            case "5pl":
                return {
                    result: fit5PL(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 5
                };
            case "linear":
                return {
                    result: fitLinear(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 2
                };
            case "quadratic":
                return {
                    result: fitQuadratic(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 3
                };
            case "cubic":
                return {
                    result: fitCubic(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 4
                };
            case "michaelisMenten":
                return {
                    result: fitMichaelisMenten(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 2
                };
            case "expGrowth":
                return {
                    result: fitExpGrowth(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 2
                };
            case "expDecay":
                return {
                    result: fitExpDecay(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 3
                };
            case "gaussian":
                return {
                    result: fitGaussian(
                        xValues,
                        yValues,
                        weights
                    ),
                    parameterCount: 3
                };
            default:
                throw new Error(
                    "Unknown fitting model."
                );
        }
    }
    function getModelDisplayName(result) {
        if (!result) {
            return "";
        }
        switch (result.type) {
            case "4pl":
                return result.constrained
                    ? "4PL (Constrained)"
                    : "4PL (Unconstrained)";
            case "5pl":
                return "5PL";
            case "linear":
                return "Linear";
            case "quadratic":
                return "Quadratic";
            case "cubic":
                return "Cubic";
            case "michaelisMenten":
                return "Michaelis-Menten";
            case "expGrowth":
                return "Exponential Growth";
            case "expDecay":
                return "Exponential Decay";
            case "gaussian":
                return "Gaussian";
            default:
                return result.type;
        }
    }
    function getParameterCount(result) {
        switch (result.type) {
            case "4pl":
                return 4;
            case "5pl":
                return 5;
            case "linear":
                return 2;
            case "quadratic":
                return 3;
            case "cubic":
                return 4;
            case "michaelisMenten":
                return 2;
            case "expGrowth":
                return 2;
            case "expDecay":
                return 3;
            case "gaussian":
                return 3;
            default:
                return 1;
        }
    }
    /* ============================================================
       COPY HELPERS
       ============================================================ */
    async function copyText(text) {
        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {
            await navigator.clipboard.writeText(
                text
            );
            return true;
        }
        const textarea =
            document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(
            textarea
        );
        textarea.select();
        let success = false;
        try {
            success =
                document.execCommand(
                    "copy"
                );
        } catch (error) {
            console.error(
                "Clipboard fallback failed:",
                error
            );
        }
        textarea.remove();
        return success;
    }
    async function copySectionText(
        button,
        textToCopy
    ) {
        try {
            await copyText(
                textToCopy
            );
            const original =
                button.textContent;
            button.textContent =
                "✓ Copied";
            setTimeout(() => {
                button.textContent =
                    original;
            }, 1500);
        } catch (error) {
            console.error(
                "Copy failed:",
                error
            );
        }
    }
    function copyParametersText(button) {
        const cards =
            document.querySelectorAll(
                "#parameterGrid .parameter-card"
            );
        const lines = [];
        cards.forEach(card => {
            const label =
                card.querySelector(
                    ".parameter-label"
                );
            const value =
                card.querySelector(
                    ".parameter-value"
                );
            if (
                label &&
                value
            ) {
                lines.push(
                    `${label.textContent.trim()}\t${value.textContent.trim()}`
                );
            }
        });
        copySectionText(
            button,
            lines.join("\n")
        );
    }
    /* ============================================================
       PREDICTION SPREADSHEET
       ============================================================ */
    function initPredictionSpreadsheet(
        rowCount = 8
    ) {
        const tbody =
            document.getElementById(
                "predictTableBody"
            );
        if (!tbody) {
            return;
        }
        tbody.innerHTML = "";
        for (
            let i = 0;
            i < rowCount;
            i++
        ) {
            addPredictionRow(
                tbody,
                i + 1
            );
        }
        updatePredictionCount();
    }
    function addPredictionRow(
        tbody,
        rowNum,
        sample = "",
        yVal = "",
        xVal = ""
    ) {
        const tr =
            document.createElement("tr");
        tr.innerHTML = `
            <td class="row-number">${rowNum}</td>
            <td
                contenteditable="true"
                class="cell cell-predict-sample"
                spellcheck="false"
            >${escapeHtml(sample)}</td>
            <td
                contenteditable="true"
                class="cell cell-predict-y"
                spellcheck="false"
            >${escapeHtml(yVal)}</td>
            <td class="cell cell-predict-x">
                ${escapeHtml(xVal)}
            </td>
        `;
        tbody.appendChild(tr);
    }
    function renumberPredictionRows() {
        const rows =
            document.querySelectorAll(
                "#predictTableBody tr"
            );
        rows.forEach(
            (row, index) => {
                const numberCell =
                    row.querySelector(
                        ".row-number"
                    );
                if (numberCell) {
                    numberCell.textContent =
                        String(index + 1);
                }
            }
        );
    }
    function ensurePredictionRows() {
        const tbody =
            document.getElementById(
                "predictTableBody"
            );
        if (!tbody) {
            return;
        }
        const rows =
            Array.from(
                tbody.querySelectorAll("tr")
            );
        if (rows.length === 0) {
            addPredictionRow(
                tbody,
                1
            );
            return;
        }
        const lastRow =
            rows[rows.length - 1];
        const sample =
            lastRow.querySelector(
                ".cell-predict-sample"
            );
        const y =
            lastRow.querySelector(
                ".cell-predict-y"
            );
        if (
            (
                sample &&
                sample.textContent.trim() !== ""
            ) ||
            (
                y &&
                y.textContent.trim() !== ""
            )
        ) {
            addPredictionRow(
                tbody,
                rows.length + 1
            );
        }
    }
    function parsePredictionTable() {
        const rows =
            document.querySelectorAll(
                "#predictTableBody tr"
            );
        const samples = [];
        const yValues = [];
        rows.forEach(row => {
            const sampleCell =
                row.querySelector(
                    ".cell-predict-sample"
                );
            const yCell =
                row.querySelector(
                    ".cell-predict-y"
                );
            if (!sampleCell || !yCell) {
                return;
            }
            const sample =
                sampleCell.textContent.trim();
            const yText =
                yCell.textContent.trim();
            if (
                sample === "" &&
                yText === ""
            ) {
                return;
            }
            if (yText === "") {
                samples.push(
                    sample
                );
                yValues.push(
                    null
                );
                return;
            }
            const y =
                parseNumber(yText);
            if (!Number.isFinite(y)) {
                throw new Error(
                    "Every populated Predict row must contain a numeric Response (Y)."
                );
            }
            samples.push(
                sample
            );
            yValues.push(
                y
            );
        });
        return {
            samples,
            yValues
        };
    }
    function updatePredictionCount() {
        const countElement =
            document.getElementById(
                "predictCount"
            );
        if (!countElement) {
            return;
        }
        let count = 0;
        try {
            const data =
                parsePredictionTable();
            count =
                data.yValues.filter(
                    y => y !== null
                ).length;
        } catch (error) {
            count = 0;
        }
        countElement.textContent =
            `${count} sample${count === 1 ? "" : "s"}`;
    }
    function predictFromResult(
        result,
        y
    ) {
        if (
            !result ||
            typeof result.inverse !==
                "function" ||
            !Number.isFinite(y)
        ) {
            return null;
        }
        try {
            const x =
                result.inverse(y);
            if (
                x === null ||
                x === undefined ||
                !Number.isFinite(x)
            ) {
                return null;
            }
            return x;
        } catch (error) {
            console.warn(
                "Prediction failed:",
                error
            );
            return null;
        }
    }
    function updatePredictionStatus(
        result,
        yValues,
        outputValues
    ) {
        const status =
            document.getElementById(
                "predictionStatus"
            );
        if (!status) {
            return;
        }
        if (!result) {
            status.textContent =
                "Fit a model to enable predictions.";
            return;
        }
        const populated =
            yValues.filter(
                y => y !== null
            );
        if (populated.length === 0) {
            status.textContent =
                `${getModelDisplayName(result)} fitted. Enter response values to predict X.`;
            return;
        }
        const successful =
            outputValues.filter(
                x =>
                    x !== null &&
                    Number.isFinite(x)
            );
        if (
            successful.length === 0
        ) {
            status.textContent =
                "N/A — this model/response range cannot be reliably inverted.";
            return;
        }
        if (
            successful.length <
            populated.length
        ) {
            status.textContent =
                "Some responses could not be reliably inverted.";
        } else {
            status.textContent =
                `${getModelDisplayName(result)} predictions calculated.`;
        }
    }
    function updatePredictions(
        result = lastResult
    ) {
        const rows =
            document.querySelectorAll(
                "#predictTableBody tr"
            );
        const outputValues = [];
        const yValues = [];
        rows.forEach(row => {
            const yCell =
                row.querySelector(
                    ".cell-predict-y"
                );
            const outputCell =
                row.querySelector(
                    ".cell-predict-x"
                );
            if (
                !yCell ||
                !outputCell
            ) {
                return;
            }
            const yText =
                yCell.textContent.trim();
            if (yText === "") {
                outputCell.textContent = "";
                return;
            }
            const y =
                parseNumber(yText);
            if (!Number.isFinite(y)) {
                outputCell.textContent =
                    "N/A";
                yValues.push(null);
                outputValues.push(null);
                return;
            }
            yValues.push(y);
            const x =
                predictFromResult(
                    result,
                    y
                );
            if (x === null) {
                outputCell.textContent =
                    "N/A";
                outputValues.push(null);
            } else {
                outputCell.textContent =
                    formatNumber(x);
                outputValues.push(x);
            }
        });
        updatePredictionCount();
        updatePredictionStatus(
            result,
            yValues,
            outputValues
        );
    }
    function copyPredictionsText(
        button
    ) {
        const rows =
            document.querySelectorAll(
                "#predictTableBody tr"
            );
        const lines = [
            "Sample\tResponse (Y)\tPredicted X"
        ];
        rows.forEach(row => {
            const sample =
                row.querySelector(
                    ".cell-predict-sample"
                );
            const y =
                row.querySelector(
                    ".cell-predict-y"
                );
            const x =
                row.querySelector(
                    ".cell-predict-x"
                );
            if (
                !sample ||
                !y ||
                !x
            ) {
                return;
            }
            const sampleText =
                sample.textContent.trim();
            const yText =
                y.textContent.trim();
            const xText =
                x.textContent.trim();
            if (
                sampleText === "" &&
                yText === ""
            ) {
                return;
            }
            lines.push(
                `${sampleText}\t${yText}\t${xText}`
            );
        });
        copySectionText(
            button,
            lines.join("\n")
        );
    }
    /* ============================================================
       CLIPBOARD PASTE
       ============================================================ */
    function splitClipboardRows(text) {
        return text
            .replace(/\r/g, "")
            .split("\n")
            .filter(
                line =>
                    line.trim() !== ""
            )
            .map(line => {
                if (
                    line.includes("\t")
                ) {
                    return line.split("\t");
                }
                if (
                    line.includes(",")
                ) {
                    return line.split(",");
                }
                return [line];
            })
            .map(row =>
                row.map(
                    value =>
                        value.trim()
                )
            );
    }
    function looksLikeHeader(
        row,
        nextRows,
        minimumColumns = 2
    ) {
        if (
            row.length <
            minimumColumns
        ) {
            return false;
        }
        const first =
            parseNumber(row[0]);
        const second =
            parseNumber(row[1]);
        if (
            Number.isFinite(first) &&
            Number.isFinite(second)
        ) {
            return false;
        }
        return nextRows.some(
            candidate =>
                candidate.length >=
                    minimumColumns &&
                Number.isFinite(
                    parseNumber(
                        candidate[0]
                    )
                ) &&
                Number.isFinite(
                    parseNumber(
                        candidate[1]
                    )
                )
        );
    }
    function handleStandardPaste(
        event
    ) {
        event.preventDefault();
        const text =
            event.clipboardData.getData(
                "text"
            );
        const rows =
            splitClipboardRows(text);
        if (rows.length === 0) {
            return;
        }
        let dataRows = rows;
        if (
            looksLikeHeader(
                rows[0],
                rows.slice(1),
                2
            )
        ) {
            dataRows =
                rows.slice(1);
        }
        const parsedRows = [];
        dataRows.forEach(row => {
            if (row.length < 2) {
                return;
            }
            const x =
                parseNumber(row[0]);
            const y =
                parseNumber(row[1]);
            if (
                Number.isFinite(x) &&
                Number.isFinite(y)
            ) {
                parsedRows.push({
                    x,
                    y
                });
            }
        });
        if (
            parsedRows.length === 0
        ) {
            showError(
                "No valid X/Y pairs were found in the pasted data."
            );
            return;
        }
        clearError();
        const tbody =
            document.getElementById(
                "dataTableBody"
            );
        if (!tbody) {
            return;
        }
        tbody.innerHTML = "";
        const rowCount =
            Math.max(
                8,
                parsedRows.length + 1
            );
        for (
            let i = 0;
            i < rowCount;
            i++
        ) {
            const row =
                parsedRows[i];
            addSpreadsheetRow(
                tbody,
                i + 1,
                row
                    ? row.x
                    : "",
                row
                    ? row.y
                    : ""
            );
        }
        updateDataCount();
    }
    function handlePredictionPaste(
        event
    ) {
        event.preventDefault();
        const text =
            event.clipboardData.getData(
                "text"
            );
        const rows =
            splitClipboardRows(text);
        if (rows.length === 0) {
            return;
        }
        let dataRows = rows;
        /*
         * Accept:
         *
         * Sample    Response
         *
         * or:
         *
         * Response
         */
        if (
            looksLikeHeader(
                rows[0],
                rows.slice(1),
                2
            )
        ) {
            dataRows =
                rows.slice(1);
        } else if (
            rows.length > 1 &&
            !Number.isFinite(
                parseNumber(
                    rows[0][0]
                )
            ) &&
            Number.isFinite(
                parseNumber(
                    rows[1][0]
                )
            )
        ) {
            dataRows =
                rows.slice(1);
        }
        const parsedRows = [];
        dataRows.forEach(
            (row, index) => {
                if (row.length === 0) {
                    return;
                }
                /*
                 * Two-column paste:
                 * Sample / Response
                 */
                if (row.length >= 2) {
                    const y =
                        parseNumber(
                            row[1]
                        );
                    if (
                        Number.isFinite(y)
                    ) {
                        parsedRows.push({
                            sample:
                                row[0] ||
                                `Sample ${index + 1}`,
                            y
                        });
                    }
                    return;
                }
                /*
                 * One-column paste:
                 * Response only
                 */
                const y =
                    parseNumber(row[0]);
                if (
                    Number.isFinite(y)
                ) {
                    parsedRows.push({
                        sample:
                            `Sample ${index + 1}`,
                        y
                    });
                }
            }
        );
        if (
            parsedRows.length === 0
        ) {
            showError(
                "No valid response values were found in the pasted Predict data."
            );
            return;
        }
        clearError();
        const tbody =
            document.getElementById(
                "predictTableBody"
            );
        if (!tbody) {
            return;
        }
        tbody.innerHTML = "";
        const rowCount =
            Math.max(
                8,
                parsedRows.length + 1
            );
        for (
            let i = 0;
            i < rowCount;
            i++
        ) {
            const row =
                parsedRows[i];
            addPredictionRow(
                tbody,
                i + 1,
                row
                    ? row.sample
                    : "",
                row
                    ? row.y
                    : "",
                ""
            );
        }
        updatePredictionCount();
        updatePredictions(
            lastResult
        );
    }
    /* ============================================================
       DATA COUNT
       ============================================================ */
    function updateDataCount() {
        const countElement =
            document.getElementById(
                "dataCount"
            );
        if (!countElement) {
            return;
        }
        let count = 0;
        try {
            const data =
                parseSpreadsheetTable();
            count =
                data.xValues.length;
        } catch (error) {
            /*
             * Do not show an error simply because the user has not
             * completed the table yet.
             */
            const rows =
                document.querySelectorAll(
                    "#dataTableBody tr"
                );
            rows.forEach(row => {
                const x =
                    row.querySelector(
                        ".cell-x"
                    );
                const y =
                    row.querySelector(
                        ".cell-y"
                    );
                if (
                    x &&
                    y &&
                    x.textContent.trim() !== "" &&
                    y.textContent.trim() !== ""
                ) {
                    count++;
                }
            });
        }
        countElement.textContent =
            `${count} data point${count === 1 ? "" : "s"}`;
    }
    /* ============================================================
       RESULTS DISPLAY
       ============================================================ */
    function makeParameterCard(
        label,
        value
    ) {
        return `
            <div class="parameter-card">
                <div class="parameter-label">
                    ${escapeHtml(label)}
                </div>
                <div class="parameter-value">
                    ${escapeHtml(formatNumber(value))}
                </div>
            </div>
        `;
    }
    function displayResults(
        xValues,
        yValues,
        result,
        stats
    ) {
        const results =
            document.getElementById(
                "results"
            );
        if (results) {
            results.classList.remove(
                "hidden"
            );
        }
        const pointCount =
            document.getElementById(
                "pointCount"
            );
        if (pointCount) {
            pointCount.textContent =
                `${xValues.length} Point${xValues.length === 1 ? "" : "s"} Fitted`;
        }
        const parameters =
            document.getElementById(
                "parameters"
            );
        if (!parameters) {
            drawChart(
                xValues,
                yValues,
                result
            );
            updatePredictions(
                result
            );
            return;
        }
        let parameterHtml = "";
        if (
            result.type === "4pl"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "Bottom",
                    result.params.bottom
                );
            parameterHtml +=
                makeParameterCard(
                    "Hill Slope",
                    result.params.hillSlope
                );
            parameterHtml +=
                makeParameterCard(
                    "IC50",
                    result.params.ic50
                );
            parameterHtml +=
                makeParameterCard(
                    "Top",
                    result.params.top
                );
        }
        else if (
            result.type === "5pl"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "Bottom",
                    result.params.bottom
                );
            parameterHtml +=
                makeParameterCard(
                    "Hill Slope",
                    result.params.hillSlope
                );
            parameterHtml +=
                makeParameterCard(
                    "IC50",
                    result.params.ic50
                );
            parameterHtml +=
                makeParameterCard(
                    "Top",
                    result.params.top
                );
            parameterHtml +=
                makeParameterCard(
                    "Asymmetry",
                    result.params.asymmetry
                );
        }
        else if (
            result.type ===
            "michaelisMenten"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "Vmax",
                    result.params.vmax
                );
            parameterHtml +=
                makeParameterCard(
                    "Km",
                    result.params.km
                );
        }
        else if (
            result.type ===
            "gaussian"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "Amplitude",
                    result.params.amplitude
                );
            parameterHtml +=
                makeParameterCard(
                    "Mean",
                    result.params.mean
                );
            parameterHtml +=
                makeParameterCard(
                    "SD",
                    result.params.sd
                );
        }
        else if (
            result.type === "cubic"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "a",
                    result.params.a
                );
            parameterHtml +=
                makeParameterCard(
                    "b",
                    result.params.b
                );
            parameterHtml +=
                makeParameterCard(
                    "c",
                    result.params.c
                );
            parameterHtml +=
                makeParameterCard(
                    "d",
                    result.params.d
                );
        }
        else if (
            result.type === "quadratic"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "a",
                    result.params.a
                );
            parameterHtml +=
                makeParameterCard(
                    "b",
                    result.params.b
                );
            parameterHtml +=
                makeParameterCard(
                    "c",
                    result.params.c
                );
        }
        else if (
            result.type === "expGrowth"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "Amplitude",
                    result.params.amplitude
                );
            parameterHtml +=
                makeParameterCard(
                    "Rate",
                    result.params.rate
                );
        }
        else if (
            result.type === "expDecay"
        ) {
            parameterHtml +=
                makeParameterCard(
                    "Amplitude",
                    result.params.amplitude
                );
            parameterHtml +=
                makeParameterCard(
                    "Rate",
                    result.params.rate
                );
            parameterHtml +=
                makeParameterCard(
                    "Offset",
                    result.params.offset
                );
        }
        else {
            parameterHtml +=
                makeParameterCard(
                    "Slope",
                    result.params.slope
                );
            parameterHtml +=
                makeParameterCard(
                    "Intercept",
                    result.params.intercept
                );
        }
        const parameterGrid =
            `
            <div
                class="parameter-grid"
                id="parameterGrid"
            >
                ${parameterHtml}
            </div>
        `;
        const statsText = [
            `R²\t${formatNumber(stats.r2)}`,
            `Adjusted R²\t${formatNumber(stats.adjustedR2)}`,
            `Standard Error\t${formatNumber(stats.se)}`,
            `SSE\t${formatNumber(stats.sse)}`,
            `F-statistic\t${formatNumber(stats.fStat)}`,
            `p-value\t${formatNumber(stats.pValue)}`,
            `AIC\t${formatNumber(stats.aic)}`,
            `AICc\t${formatNumber(stats.aicc)}`,
            `BIC\t${formatNumber(stats.bic)}`
        ].join("\n");
        const equationText =
            result.equation ||
            "";
        const statisticsHtml = `
            <div class="fit-statistics">
                <div class="result-section-header">
                    <div>
                        <h3>Fit Statistics</h3>
                    </div>
                    <button
                        type="button"
                        class="btn-copy-mini"
                        onclick="copySectionText(this, ${JSON.stringify(statsText)})"
                    >
                        Copy
                    </button>
                </div>
                <div class="stats-grid">
                    <div>
                        <span>R²</span>
                        <strong>${formatNumber(stats.r2)}</strong>
                    </div>
                    <div>
                        <span>Adjusted R²</span>
                        <strong>${formatNumber(stats.adjustedR2)}</strong>
                    </div>
                    <div>
                        <span>Standard Error</span>
                        <strong>${formatNumber(stats.se)}</strong>
                    </div>
                    <div>
                        <span>SSE</span>
                        <strong>${formatNumber(stats.sse)}</strong>
                    </div>
                    <div>
                        <span>F-statistic</span>
                        <strong>${formatNumber(stats.fStat)}</strong>
                    </div>
                    <div>
                        <span>p-value</span>
                        <strong>${formatNumber(stats.pValue)}</strong>
                    </div>
                    <div>
                        <span>AIC</span>
                        <strong>${formatNumber(stats.aic)}</strong>
                    </div>
                    <div>
                        <span>AICc</span>
                        <strong>${formatNumber(stats.aicc)}</strong>
                    </div>
                    <div>
                        <span>BIC</span>
                        <strong>${formatNumber(stats.bic)}</strong>
                    </div>
                </div>
            </div>
        `;
        const equationHtml = `
            <div class="equation-section">
                <div class="result-section-header">
                    <div>
                        <h3>${escapeHtml(getModelDisplayName(result))}</h3>
                    </div>
                    <button
                        type="button"
                        class="btn-copy-mini"
                        onclick="copySectionText(this, ${JSON.stringify(equationText)})"
                    >
                        Copy
                    </button>
                </div>
                <div class="equation-box">
                    ${escapeHtml(equationText)}
                </div>
            </div>
        `;
        const copyParametersButton = `
            <div class="result-section-header">
                <div>
                    <h3>Parameters</h3>
                </div>
                <button
                    type="button"
                    class="btn-copy-mini"
                    onclick="copyParametersText(this)"
                >
                    Copy
                </button>
            </div>
        `;
        parameters.innerHTML =
            copyParametersButton +
            parameterGrid +
            statisticsHtml +
            equationHtml;
        drawChart(
            xValues,
            yValues,
            result
        );
        updatePredictions(
            result
        );
    }
    /* ============================================================
       CHART
       ============================================================ */
    function drawChart(
        xValues,
        yValues,
        result
    ) {
        const canvas =
            document.getElementById(
                "fitChart"
            );
        if (!canvas) {
            return;
        }
        if (
            typeof Chart ===
            "undefined"
        ) {
            console.warn(
                "Chart.js is not available."
            );
            return;
        }
        if (myFitChart) {
            myFitChart.destroy();
            myFitChart = null;
        }
        const minX =
            Math.min(...xValues);
        const maxX =
            Math.max(...xValues);
        const curvePoints = [];
        const pointCount = 150;
        for (
            let i = 0;
            i <= pointCount;
            i++
        ) {
            const fraction =
                i / pointCount;
            const x =
                minX +
                fraction *
                (maxX - minX);
            const y =
                result.predict(x);
            if (
                Number.isFinite(y)
            ) {
                curvePoints.push({
                    x,
                    y
                });
            }
        }
        const observedPoints =
            xValues.map(
                (x, i) => ({
                    x,
                    y: yValues[i]
                })
            );
        myFitChart =
            new Chart(
                canvas.getContext("2d"),
                {
                    type: "scatter",
                    data: {
                        datasets: [
                            {
                                label:
                                    "Observed Data",
                                data:
                                    observedPoints,
                                showLine: false,
                                pointRadius: 5
                            },
                            {
                                label:
                                    `Fitted Curve (${getModelDisplayName(result)})`,
                                data:
                                    curvePoints,
                                type: "line",
                                showLine: true,
                                pointRadius: 0,
                                borderWidth: 2,
                                tension: 0.15
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
                                    text:
                                        "Concentration (X)"
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text:
                                        "Response (Y)"
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: true
                            }
                        }
                    }
                }
            );
    }
    /* ============================================================
       MAIN CALCULATION
       ============================================================ */
    function calculate4PL({
        silent = false
    } = {}) {
        clearError();
        try {
            const data =
                parseSpreadsheetTable();
            const modelElement =
                document.getElementById(
                    "fitModel"
                );
            const weightingElement =
                document.getElementById(
                    "weighting"
                );
            const modelType =
                modelElement
                    ? modelElement.value
                    : "4pl_unconstrained";
            const weighting =
                weightingElement
                    ? weightingElement.value
                    : "none";
            const {
                result,
                parameterCount
            } =
                fitSelectedModel(
                    modelType,
                    data.xValues,
                    data.yValues,
                    weighting
                );
            const weights =
                getWeights(
                    data.xValues,
                    data.yValues,
                    weighting
                );
            const stats =
                calculateFitStats(
                    data.xValues,
                    data.yValues,
                    result,
                    parameterCount,
                    weights
                );
            lastX =
                data.xValues.slice();
            lastY =
                data.yValues.slice();
            lastResult =
                result;
            displayResults(
                lastX,
                lastY,
                lastResult,
                stats
            );
        } catch (error) {
            console.error(
                "Calculation error:",
                error
            );
            if (!silent) {
                showError(
                    error.message ||
                    "Unable to fit the selected model."
                );
            }
        }
    }
    /* ============================================================
       CLEAR
       ============================================================ */
    function clearCalculator() {
        clearError();
        lastX = null;
        lastY = null;
        lastResult = null;
        const results =
            document.getElementById(
                "results"
            );
        if (results) {
            results.classList.add(
                "hidden"
            );
        }
        const tbody =
            document.getElementById(
                "dataTableBody"
            );
        if (tbody) {
            tbody.innerHTML = "";
            for (
                let i = 0;
                i < 8;
                i++
            ) {
                addSpreadsheetRow(
                    tbody,
                    i + 1
                );
            }
        }
        const predictBody =
            document.getElementById(
                "predictTableBody"
            );
        if (predictBody) {
            predictBody.innerHTML = "";
            for (
                let i = 0;
                i < 8;
                i++
            ) {
                addPredictionRow(
                    predictBody,
                    i + 1
                );
            }
        }
        updateDataCount();
        updatePredictionCount();
        updatePredictions(null);
        if (myFitChart) {
            myFitChart.destroy();
            myFitChart = null;
        }
    }
    /* ============================================================
       AUTOMATIC UPDATE
       ============================================================ */
    function handleStandardInput() {
        clearError();
        ensureStandardRows();
        renumberStandardRows();
        updateDataCount();
    }
    function handlePredictionInput() {
        clearError();
        ensurePredictionRows();
        renumberPredictionRows();
        updatePredictionCount();
        updatePredictions(
            lastResult
        );
    }
    /* ============================================================
       INITIALISATION
       ============================================================ */
    function initialiseCalculator() {
        if (
            window.__labCalculatorInitialised
        ) {
            return;
        }
        window.__labCalculatorInitialised =
            true;
        /*
         * Repair the duplicate/malformed spreadsheet markup before
         * looking up either tbody.
         */
        normaliseSpreadsheetTables();
        /*
         * Now that the IDs are unique, initialise the two tables.
         */
        initSpreadsheet(8);
        initPredictionSpreadsheet(8);
        const standardTable =
            document.getElementById(
                "dataTable"
            );
        if (standardTable) {
            standardTable.addEventListener(
                "paste",
                handleStandardPaste
            );
            standardTable.addEventListener(
                "input",
                handleStandardInput
            );
        }
        const predictionTable =
            document.getElementById(
                "predictTable"
            );
        if (predictionTable) {
            predictionTable.addEventListener(
                "paste",
                handlePredictionPaste
            );
            predictionTable.addEventListener(
                "input",
                handlePredictionInput
            );
        }
        const calculateButton =
            document.getElementById(
                "calculateButton"
            );
        if (calculateButton) {
            calculateButton.addEventListener(
                "click",
                () =>
                    calculate4PL()
            );
        }
        const clearButton =
            document.getElementById(
                "clearButton"
            );
        if (clearButton) {
            clearButton.addEventListener(
                "click",
                clearCalculator
            );
        }
        const fitModel =
            document.getElementById(
                "fitModel"
            );
        if (fitModel) {
            fitModel.addEventListener(
                "change",
                () =>
                    calculate4PL({
                        silent: true
                    })
            );
        }
        const weighting =
            document.getElementById(
                "weighting"
            );
        if (weighting) {
            weighting.addEventListener(
                "change",
                () =>
                    calculate4PL({
                        silent: true
                    })
            );
        }
        const copyPredictionButton =
            document.getElementById(
                "copyPredictionButton"
            );
        if (copyPredictionButton) {
            copyPredictionButton.addEventListener(
                "click",
                () =>
                    copyPredictionsText(
                        copyPredictionButton
                    )
            );
        }
        window.addEventListener(
            "resize",
            () => {
                if (myFitChart) {
                    myFitChart.resize();
                }
            }
        );
    }
    /* ============================================================
       GLOBAL FUNCTIONS
       ============================================================ */
    /*
     * These are exposed because the generated Results section uses
     * inline onclick handlers for the copy buttons.
     */
    window.calculate4PL =
        calculate4PL;
    window.clearCalculator =
        clearCalculator;
    window.copySectionText =
        copySectionText;
    window.copyParametersText =
        copyParametersText;
    window.copyPredictionsText =
        copyPredictionsText;
    /* ============================================================
       START
       ============================================================ */
    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initialiseCalculator,
            {
                once: true
            }
        );
    } else {
        initialiseCalculator();
    }
})();

This version is safe to use with your current HTML, including the duplicate app.js inclusion and duplicate dataTable/dataTableBody IDs. It repairs those IDs in JavaScript rather than wiping out the standard input table.

One thing I would still change later is the HTML itself: remove the second <script src="app.js"></script> and replace the malformed second table with a clean Predict section. The JS above is deliberately defensive so you don’t have to do that immediately.