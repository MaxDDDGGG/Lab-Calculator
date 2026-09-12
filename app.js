"use strict";
/*
 * 4PL Laboratory Calculator
 *
 * Model:
 *
 *       D + (A - D)
 * y = -----------------
 *       1 + (x / C)^B
 *
 * A = upper asymptote
 * B = slope / Hill coefficient
 * C = inflection point
 * D = lower asymptote
 *
 * Notes:
 * - X values must be > 0 because the model uses x / C.
 * - The fit is performed in log-parameter space for C.
 * - Multiple starting points are attempted.
 * - No external JavaScript libraries are required.
 *
 * This is intended as a browser-based analytical tool.
 * For regulated diagnostic use, independently validate the
 * implementation against a validated reference implementation.
 */
const FIT_CONFIG = {
    maxIterations: 500,
    tolerance: 1e-9,
    parameterTolerance: 1e-8,
    // Bounds for A and D are based on observed Y values,
    // with generous padding.
    asymptotePadding: 5,
    // B is deliberately constrained to avoid pathological fits.
    minB: -20,
    maxB: 20,
    // C must remain positive.
    minLogC: -30,
    maxLogC: 30,
    // Number of different initial parameter combinations.
    maxStarts: 24
};
let currentAnalysis = null;
/* ============================================================
   4PL MODEL
   ============================================================ */
function fourPL(x, A, B, C, D) {
    if (!(x > 0) || !(C > 0)) {
        return NaN;
    }
    const exponent = B * Math.log(x / C);
    // Prevent Math.exp() overflow.
    if (exponent > 700) {
        return D;
    }
    if (exponent < -700) {
        return A;
    }
    return D + (A - D) / (1 + Math.exp(exponent));
}
/* ============================================================
   BASIC NUMERICAL HELPERS
   ============================================================ */
function mean(values) {
    if (!values.length) {
        return NaN;
    }
    return values.reduce((a, b) => a + b, 0) / values.length;
}
function min(values) {
    return Math.min(...values);
}
function max(values) {
    return Math.max(...values);
}
function sum(values) {
    return values.reduce((a, b) => a + b, 0);
}
function clamp(value, lower, upper) {
    return Math.max(lower, Math.min(upper, value));
}
function nearlyEqual(a, b, tolerance = 1e-12) {
    return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}
/* ============================================================
   LINEAR ALGEBRA
   ============================================================ */
/*
 * Solve A*x = b using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(matrix, vector) {
    const n = vector.length;
    const a = matrix.map((row, i) => [
        ...row,
        vector[i]
    ]);
    for (let column = 0; column < n; column++) {
        let pivot = column;
        for (let row = column + 1; row < n; row++) {
            if (
                Math.abs(a[row][column]) >
                Math.abs(a[pivot][column])
            ) {
                pivot = row;
            }
        }
        if (Math.abs(a[pivot][column]) < 1e-14) {
            return null;
        }
        [a[column], a[pivot]] = [a[pivot], a[column]];
        for (let row = column + 1; row < n; row++) {
            const factor =
                a[row][column] /
                a[column][column];
            for (let j = column; j <= n; j++) {
                a[row][j] -=
                    factor * a[column][j];
            }
        }
    }
    const solution = new Array(n);
    for (let row = n - 1; row >= 0; row--) {
        let value = a[row][n];
        for (let column = row + 1; column < n; column++) {
            value -=
                a[row][column] *
                solution[column];
        }
        solution[row] =
            value /
            a[row][row];
    }
    return solution;
}
/* ============================================================
   PARAMETER REPRESENTATION
   ============================================================ */
/*
 * Internally:
 *
 * p[0] = A
 * p[1] = B
 * p[2] = log(C)
 * p[3] = D
 *
 * C = exp(logC)
 */
function parametersToValues(p) {
    return {
        A: p[0],
        B: p[1],
        C: Math.exp(p[2]),
        D: p[3]
    };
}
function valuesToParameters(A, B, C, D) {
    return [
        A,
        B,
        Math.log(C),
        D
    ];
}
/* ============================================================
   MODEL ERROR
   ============================================================ */
function calculateResiduals(parameters, x, y) {
    const { A, B, C, D } =
        parametersToValues(parameters);
    return y.map((observed, i) => {
        const predicted =
            fourPL(x[i], A, B, C, D);
        return observed - predicted;
    });
}
function calculateSSE(parameters, x, y) {
    const residuals =
        calculateResiduals(parameters, x, y);
    return residuals.reduce(
        (total, value) =>
            total + value * value,
        0
    );
}
/* ============================================================
   NUMERICAL JACOBIAN
   ============================================================ */
function calculateJacobian(parameters, x, y) {
    const baseResiduals =
        calculateResiduals(parameters, x, y);
    const jacobian =
        Array.from(
            { length: x.length },
            () => new Array(4).fill(0)
        );
    for (let parameter = 0; parameter < 4; parameter++) {
        const step =
            1e-6 *
            Math.max(
                1,
                Math.abs(parameters[parameter])
            );
        const perturbed =
            parameters.slice();
        perturbed[parameter] += step;
        const perturbedResiduals =
            calculateResiduals(
                perturbed,
                x,
                y
            );
        for (let i = 0; i < x.length; i++) {
            jacobian[i][parameter] =
                (
                    perturbedResiduals[i] -
                    baseResiduals[i]
                ) / step;
        }
    }
    return jacobian;
}
/* ============================================================
   PARAMETER BOUNDS
   ============================================================ */
function applyParameterBounds(
    parameters,
    yMin,
    yMax
) {
    const padding =
        Math.max(
            (yMax - yMin) * FIT_CONFIG.asymptotePadding,
            1
        );
    parameters[0] =
        clamp(
            parameters[0],
            yMin - padding,
            yMax + padding
        );
    parameters[1] =
        clamp(
            parameters[1],
            FIT_CONFIG.minB,
            FIT_CONFIG.maxB
        );
    parameters[2] =
        clamp(
            parameters[2],
            FIT_CONFIG.minLogC,
            FIT_CONFIG.maxLogC
        );
    parameters[3] =
        clamp(
            parameters[3],
            yMin - padding,
            yMax + padding
        );
    return parameters;
}
/* ============================================================
   LEVENBERG-MARQUARDT FIT
   ============================================================ */
function fitFromStart(
    startParameters,
    x,
    y
) {
    let parameters =
        startParameters.slice();
    const yMin = min(y);
    const yMax = max(y);
    parameters =
        applyParameterBounds(
            parameters,
            yMin,
            yMax
        );
    let currentSSE =
        calculateSSE(
            parameters,
            x,
            y
        );
    let lambda = 0.01;
    for (
        let iteration = 0;
        iteration < FIT_CONFIG.maxIterations;
        iteration++
    ) {
        const jacobian =
            calculateJacobian(
                parameters,
                x,
                y
            );
        const normalMatrix =
            Array.from(
                { length: 4 },
                () => new Array(4).fill(0)
            );
        const gradient =
            new Array(4).fill(0);
        const residuals =
            calculateResiduals(
                parameters,
                x,
                y
            );
        for (let i = 0; i < x.length; i++) {
            for (let j = 0; j < 4; j++) {
                gradient[j] +=
                    jacobian[i][j] *
                    residuals[i];
                for (let k = 0; k < 4; k++) {
                    normalMatrix[j][k] +=
                        jacobian[i][j] *
                        jacobian[i][k];
                }
            }
        }
        for (let j = 0; j < 4; j++) {
            normalMatrix[j][j] += lambda;
        }
        const step =
            solveLinearSystem(
                normalMatrix,
                gradient
            );
        if (!step) {
            break;
        }
        const candidate =
            parameters.map(
                (value, i) =>
                    value + step[i]
            );
        applyParameterBounds(
            candidate,
            yMin,
            yMax
        );
        const candidateSSE =
            calculateSSE(
                candidate,
                x,
                y
            );
        if (
            Number.isFinite(candidateSSE) &&
            candidateSSE < currentSSE
        ) {
            const improvement =
                currentSSE - candidateSSE;
            parameters =
                candidate;
            currentSSE =
                candidateSSE;
            lambda =
                Math.max(
                    lambda / 3,
                    1e-12
                );
            const stepSize =
                Math.max(
                    ...step.map(
                        value => Math.abs(value)
                    )
                );
            if (
                improvement <
                    FIT_CONFIG.tolerance ||
                stepSize <
                    FIT_CONFIG.parameterTolerance
            ) {
                break;
            }
        } else {
            lambda =
                Math.min(
                    lambda * 10,
                    1e12
                );
        }
    }
    return {
        parameters,
        sse: currentSSE
    };
}
/* ============================================================
   INITIAL STARTING VALUES
   ============================================================ */
function generateStartingPoints(x, y) {
    const xMin = min(x);
    const xMax = max(x);
    const yMin = min(y);
    const yMax = max(y);
    const xMiddle =
        Math.sqrt(xMin * xMax);
    const starts = [];
    const asymptotes = [
        [yMax, yMin],
        [yMax + (yMax - yMin) * 0.1, yMin],
        [yMax, yMin - (yMax - yMin) * 0.1],
        [yMin, yMax]
    ];
    const slopes = [
        1,
        -1,
        0.5,
        -0.5,
        2,
        -2
    ];
    const cValues = [
        xMin,
        Math.sqrt(xMin * xMax),
        xMax
    ];
    for (const [A, D] of asymptotes) {
        for (const B of slopes) {
            for (const C of cValues) {
                starts.push(
                    valuesToParameters(
                        A,
                        B,
                        C,
                        D
                    )
                );
                if (
                    starts.length >=
                    FIT_CONFIG.maxStarts
                ) {
                    return starts;
                }
            }
        }
    }
    return starts;
}
/* ============================================================
   COMPLETE FIT
   ============================================================ */
function fit4PL(x, y) {
    if (x.length < 4) {
        throw new Error(
            "At least four standard points are required."
        );
    }
    if (x.length !== y.length) {
        throw new Error(
            "X and Y must contain the same number of values."
        );
    }
    if (
        new Set(x).size < 4
    ) {
        throw new Error(
            "At least four unique concentration values are required."
        );
    }
    const yRange =
        max(y) - min(y);
    if (!(yRange > 0)) {
        throw new Error(
            "Response values must contain variation."
        );
    }
    const starts =
        generateStartingPoints(
            x,
            y
        );
    let best = null;
    for (const start of starts) {
        const result =
            fitFromStart(
                start,
                x,
                y
            );
        if (
            !Number.isFinite(result.sse)
        ) {
            continue;
        }
        if (
            !best ||
            result.sse < best.sse
        ) {
            best = result;
        }
    }
    if (!best) {
        throw new Error(
            "The 4PL optimisation failed."
        );
    }
    const fitted =
        parametersToValues(
            best.parameters
        );
    if (
        !Number.isFinite(fitted.A) ||
        !Number.isFinite(fitted.B) ||
        !Number.isFinite(fitted.C) ||
        !Number.isFinite(fitted.D) ||
        fitted.C <= 0
    ) {
        throw new Error(
            "The fitted parameters are invalid."
        );
    }
    const predictions =
        x.map(value =>
            fourPL(
                value,
                fitted.A,
                fitted.B,
                fitted.C,
                fitted.D
            )
        );
    const residuals =
        y.map(
            (value, i) =>
                value - predictions[i]
        );
    const yMean =
        mean(y);
    const totalSS =
        y.reduce(
            (total, value) =>
                total +
                Math.pow(
                    value - yMean,
                    2
                ),
            0
        );
    const rSquared =
        totalSS > 0
            ? 1 - best.sse / totalSS
            : NaN;
    const rmse =
        Math.sqrt(
            best.sse /
            Math.max(
                x.length - 4,
                1
            )
        );
    return {
        parameters: fitted,
        x,
        y,
        predictions,
        residuals,
        sse: best.sse,
        rSquared,
        rmse
    };
}
/* ============================================================
   4PL INVERSE
   ============================================================ */
/*
 * Rearranged 4PL:
 *
 * y = D + (A-D)/(1+(x/C)^B)
 *
 * x = C * (((A-D)/(y-D))-1)^(1/B)
 */
function inverse4PL(y, parameters) {
    const {
        A,
        B,
        C,
        D
    } = parameters;
    if (
        !Number.isFinite(y) ||
        !Number.isFinite(A) ||
        !Number.isFinite(B) ||
        !Number.isFinite(C) ||
        !Number.isFinite(D)
    ) {
        return NaN;
    }
    if (C <= 0 || B === 0) {
        return NaN;
    }
    const numerator =
        A - D;
    const denominator =
        y - D;
    if (
        Math.abs(denominator) < 1e-14
    ) {
        return NaN;
    }
    const ratio =
        numerator /
        denominator;
    const inner =
        ratio - 1;
    /*
     * For real-valued x, inner must be positive
     * for a general non-integer B.
     */
    if (!(inner > 0)) {
        return NaN;
    }
    const logX =
        Math.log(C) +
        Math.log(inner) / B;
    if (
        logX > 700 ||
        logX < -700
    ) {
        return NaN;
    }
    const x =
        Math.exp(logX);
    return Number.isFinite(x)
        ? x
        : NaN;
}
/* ============================================================
   INPUT PARSING
   ============================================================ */
function parseNumberList(text) {
    if (
        typeof text !== "string" ||
        !text.trim()
    ) {
        return [];
    }
    return text
        .split(/[\s,;\t\n]+/)
        .map(value =>
            Number(value.trim())
        );
}
function parseStandards() {
    const x =
        parseNumberList(
            document.getElementById(
                "xValues"
            ).value
        );
    const y =
        parseNumberList(
            document.getElementById(
                "yValues"
            ).value
        );
    if (!x.length || !y.length) {
        throw new Error(
            "Please enter standard concentrations and responses."
        );
    }
    if (x.length !== y.length) {
        throw new Error(
            `You entered ${x.length} concentrations but ${y.length} responses.`
        );
    }
    if (x.some(value =>
        !Number.isFinite(value) ||
        value <= 0
    )) {
        throw new Error(
            "All concentrations must be finite numbers greater than zero."
        );
    }
    if (y.some(value =>
        !Number.isFinite(value)
    )) {
        throw new Error(
            "All response values must be finite numbers."
        );
    }
    return {
        x,
        y
    };
}
/* ============================================================
   VALIDATION
   ============================================================ */
function validateFit(result) {
    const warnings = [];
    const {
        parameters,
        x,
        y,
        rSquared,
        rmse
    } = result;
    if (
        !Number.isFinite(rSquared) ||
        rSquared < 0.90
    ) {
        warnings.push(
            "The fitted R² is below 0.90. Review the standard curve and fit."
        );
    }
    if (
        Math.abs(parameters.B) < 0.05
    ) {
        warnings.push(
            "The fitted slope is very close to zero."
        );
    }
    if (
        parameters.C < min(x) ||
        parameters.C > max(x)
    ) {
        warnings.push(
            "The inflection point C lies outside the standard concentration range."
        );
    }
    if (
        !Number.isFinite(rmse)
    ) {
        warnings.push(
            "RMSE could not be calculated."
        );
    }
    const predictions =
        result.predictions;
    const residuals =
        result.residuals;
    const maxResidual =
        Math.max(
            ...residuals.map(
                value => Math.abs(value)
            )
        );
    const yRange =
        max(y) - min(y);
    if (
        yRange > 0 &&
        maxResidual >
            yRange * 0.25
    ) {
        warnings.push(
            "At least one residual is large relative to the response range."
        );
    }
    return warnings;
}
/* ============================================================
   UI SETUP
   ============================================================ */
function setupUnknownSamplesUI() {
    if (
        document.getElementById(
            "unknownSection"
        )
    ) {
        return;
    }
    const results =
        document.getElementById(
            "results"
        );
    if (!results) {
        return;
    }
    const section =
        document.createElement(
            "section"
        );
    section.id =
        "unknownSection";
    section.className =
        "card";
    section.innerHTML = `
        <h2>Unknown Samples</h2>
        <p>
            Enter sample response values separated by commas.
        </p>
        <textarea
            id="unknownValues"
            placeholder="0.31, 0.54, 0.78"></textarea>
        <button id="calculateUnknownsButton">
            Calculate Unknowns
        </button>
        <div id="unknownResults"></div>
    `;
    results.parentNode.insertBefore(
        section,
        results
    );
    document
        .getElementById(
            "calculateUnknownsButton"
        )
        .addEventListener(
            "click",
            calculateUnknowns
        );
}
/* ============================================================
   MAIN CALCULATION
   ============================================================ */
function calculate4PL() {
    clearMessage();
    try {
        const standards =
            parseStandards();
        const result =
            fit4PL(
                standards.x,
                standards.y
            );
        currentAnalysis =
            result;
        const warnings =
            validateFit(
                result
            );
        displayResults(
            result,
            warnings
        );
        drawChart(
            result
        );
    } catch (error) {
        showMessage(
            error.message ||
            "An unexpected error occurred.",
            "error"
        );
    }
}
/* ============================================================
   DISPLAY RESULTS
   ============================================================ */
function displayResults(
    result,
    warnings
) {
    const {
        parameters,
        sse,
        rSquared,
        rmse
    } = result;
    const parametersElement =
        document.getElementById(
            "parameters"
        );
    parametersElement.innerHTML = `
        <div class="result-grid">
            <div>
                <strong>A</strong>
                <span>${formatNumber(parameters.A)}</span>
            </div>
            <div>
                <strong>B</strong>
                <span>${formatNumber(parameters.B)}</span>
            </div>
            <div>
                <strong>C</strong>
                <span>${formatNumber(parameters.C)}</span>
            </div>
            <div>
                <strong>D</strong>
                <span>${formatNumber(parameters.D)}</span>
            </div>
            <div>
                <strong>R²</strong>
                <span>${formatNumber(rSquared)}</span>
            </div>
            <div>
                <strong>RMSE</strong>
                <span>${formatNumber(rmse)}</span>
            </div>
            <div>
                <strong>SSE</strong>
                <span>${formatNumber(sse)}</span>
            </div>
        </div>
        <div id="fitWarnings"></div>
        <button id="exportCsvButton">
            Export CSV
        </button>
    `;
    const warningElement =
        document.getElementById(
            "fitWarnings"
        );
    if (warnings.length) {
        warningElement.innerHTML = `
            <div class="warning">
                <strong>Review:</strong>
                <ul>
                    ${warnings
                        .map(
                            warning =>
                                `<li>${escapeHtml(warning)}</li>`
                        )
                        .join("")}
                </ul>
            </div>
        `;
    } else {
        warningElement.innerHTML = `
            <div class="success">
                Fit completed without the configured validation warnings.
            </div>
        `;
    }
    document
        .getElementById(
            "exportCsvButton"
        )
        .addEventListener(
            "click",
            exportCSV
        );
    document
        .getElementById(
            "results"
        )
        .classList.remove(
            "hidden"
        );
}
/* ============================================================
   UNKNOWN CALCULATIONS
   ============================================================ */
function calculateUnknowns() {
    if (!currentAnalysis) {
        showMessage(
            "Calculate the standard curve first.",
            "error"
        );
        return;
    }
    const input =
        document.getElementById(
            "unknownValues"
        );
    const output =
        document.getElementById(
            "unknownResults"
        );
    const values =
        parseNumberList(
            input.value
        );
    if (!values.length) {
        output.innerHTML =
            `<div class="warning">
                Enter at least one unknown response.
            </div>`;
        return;
    }
    if (
        values.some(
            value =>
                !Number.isFinite(value)
        )
    ) {
        output.innerHTML =
            `<div class="warning">
                Unknown responses must all be finite numbers.
            </div>`;
        return;
    }
    const {
        parameters,
        x
    } = currentAnalysis;
    const responseMin =
        min(
            x.map(
                value =>
                    fourPL(
                        value,
                        parameters.A,
                        parameters.B,
                        parameters.C,
                        parameters.D
                    )
            )
        );
    const responseMax =
        max(
            x.map(
                value =>
                    fourPL(
                        value,
                        parameters.A,
                        parameters.B,
                        parameters.C,
                        parameters.D
                    )
            )
        );
    const lowerResponse =
        Math.min(
            responseMin,
            responseMax
        );
    const upperResponse =
        Math.max(
            responseMin,
            responseMax
        );
    const concentrationMin =
        min(x);
    const concentrationMax =
        max(x);
    const rows =
        values.map(
            (response, index) => {
                const concentration =
                    inverse4PL(
                        response,
                        parameters
                    );
                const inRange =
                    response >= lowerResponse &&
                    response <= upperResponse &&
                    concentration >= concentrationMin &&
                    concentration <= concentrationMax;
                return {
                    sample:
                        `Unknown ${index + 1}`,
                    response,
                    concentration,
                    status:
                        Number.isFinite(
                            concentration
                        )
                            ? (
                                inRange
                                    ? "Within range"
                                    : "Outside range"
                            )
                            : "Not calculable"
                };
            }
        );
    output.innerHTML = `
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Sample</th>
                        <th>Response</th>
                        <th>Concentration</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${row.sample}</td>
                            <td>
                                ${formatNumber(row.response)}
                            </td>
                            <td>
                                ${
                                    Number.isFinite(
                                        row.concentration
                                    )
                                        ? formatNumber(
                                            row.concentration
                                        )
                                        : "—"
                                }
                            </td>
                            <td>
                                ${escapeHtml(row.status)}
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
        <p class="note">
            Results outside the standard concentration range should
            not be interpreted as interpolated concentrations without
            appropriate validation.
        </p>
    `;
    currentAnalysis.unknowns =
        rows;
}
/* ============================================================
   CHART
   ============================================================ */
function drawChart(result) {
    const canvas =
        document.getElementById(
            "chart"
        );
    if (!canvas) {
        return;
    }
    const rect =
        canvas.getBoundingClientRect();
    const width =
        Math.max(
            rect.width,
            300
        );
    const height =
        400;
    const dpr =
        window.devicePixelRatio || 1;
    canvas.width =
        width * dpr;
    canvas.height =
        height * dpr;
    canvas.style.height =
        `${height}px`;
    const ctx =
        canvas.getContext(
            "2d"
        );
    ctx.scale(
        dpr,
        dpr
    );
    ctx.clearRect(
        0,
        0,
        width,
        height
    );
    const padding = {
        left: 60,
        right: 20,
        top: 20,
        bottom: 50
    };
    const plotWidth =
        width -
        padding.left -
        padding.right;
    const plotHeight =
        height -
        padding.top -
        padding.bottom;
    const xMin =
        min(result.x);
    const xMax =
        max(result.x);
    const allY =
        result.y.concat(
            result.predictions
        );
    const yMin =
        min(allY);
    const yMax =
        max(allY);
    const yRange =
        Math.max(
            yMax - yMin,
            1e-12
        );
    const logXMin =
        Math.log10(xMin);
    const logXMax =
        Math.log10(xMax);
    function mapX(x) {
        return padding.left +
            (
                (Math.log10(x) - logXMin) /
                (logXMax - logXMin)
            ) *
            plotWidth;
    }
    function mapY(y) {
        return padding.top +
            (
                (yMax - y) /
                yRange
            ) *
            plotHeight;
    }
    // Background
    ctx.fillStyle =
        "#ffffff";
    ctx.fillRect(
        0,
        0,
        width,
        height
    );
    // Axes
    ctx.strokeStyle =
        "#333";
    ctx.lineWidth =
        1;
    ctx.beginPath();
    ctx.moveTo(
        padding.left,
        padding.top
    );
    ctx.lineTo(
        padding.left,
        height - padding.bottom
    );
    ctx.lineTo(
        width - padding.right,
        height - padding.bottom
    );
    ctx.stroke();
    // Grid
    ctx.strokeStyle =
        "#dddddd";
    ctx.lineWidth =
        1;
    for (let i = 0; i <= 5; i++) {
        const y =
            padding.top +
            (i / 5) *
            plotHeight;
        ctx.beginPath();
        ctx.moveTo(
            padding.left,
            y
        );
        ctx.lineTo(
            width - padding.right,
            y
        );
        ctx.stroke();
        const value =
            yMax -
            (i / 5) *
            yRange;
        ctx.fillStyle =
            "#555";
        ctx.font =
            "12px Arial";
        ctx.textAlign =
            "right";
        ctx.fillText(
            formatNumber(value, 3),
            padding.left - 8,
            y + 4
        );
    }
    // X labels
    ctx.textAlign =
        "center";
    ctx.fillStyle =
        "#555";
    for (let i = 0; i <= 4; i++) {
        const logX =
            logXMin +
            (i / 4) *
            (logXMax - logXMin);
        const x =
            Math.pow(
                10,
                logX
            );
        ctx.fillText(
            formatNumber(x, 3),
            mapX(x),
            height - padding.bottom + 20
        );
    }
    // Fitted curve
    ctx.strokeStyle =
        "#1565c0";
    ctx.lineWidth =
        2.5;
    ctx.beginPath();
    const curvePoints =
        250;
    for (
        let i = 0;
        i < curvePoints;
        i++
    ) {
        const fraction =
            i /
            (curvePoints - 1);
        const logX =
            logXMin +
            fraction *
            (logXMax - logXMin);
        const x =
            Math.pow(
                10,
                logX
            );
        const y =
            fourPL(
                x,
                result.parameters.A,
                result.parameters.B,
                result.parameters.C,
                result.parameters.D
            );
        const px =
            mapX(x);
        const py =
            mapY(y);
        if (i === 0) {
            ctx.moveTo(
                px,
                py
            );
        } else {
            ctx.lineTo(
                px,
                py
            );
        }
    }
    ctx.stroke();
    // Standard points
    ctx.fillStyle =
        "#d32f2f";
    for (
        let i = 0;
        i < result.x.length;
        i++
    ) {
        const px =
            mapX(
                result.x[i]
            );
        const py =
            mapY(
                result.y[i]
            );
        ctx.beginPath();
        ctx.arc(
            px,
            py,
            5,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }
    // Axis labels
    ctx.fillStyle =
        "#222";
    ctx.font =
        "13px Arial";
    ctx.textAlign =
        "center";
    ctx.fillText(
        "Concentration",
        padding.left +
        plotWidth / 2,
        height - 8
    );
    ctx.save();
    ctx.translate(
        15,
        padding.top +
        plotHeight / 2
    );
    ctx.rotate(
        -Math.PI / 2
    );
    ctx.fillText(
        "Response",
        0,
        0
    );
    ctx.restore();
    // Legend
    ctx.fillStyle =
        "#d32f2f";
    ctx.beginPath();
    ctx.arc(
        width - 130,
        25,
        4,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle =
        "#333";
    ctx.textAlign =
        "left";
    ctx.fillText(
        "Standards",
        width - 120,
        29
    );
    ctx.strokeStyle =
        "#1565c0";
    ctx.lineWidth =
        2;
    ctx.beginPath();
    ctx.moveTo(
        width - 130,
        45
    );
    ctx.lineTo(
        width - 110,
        45
    );
    ctx.stroke();
    ctx.fillStyle =
        "#333";
    ctx.fillText(
        "4PL fit",
        width - 105,
        49
    );
}
/* ============================================================
   CSV EXPORT
   ============================================================ */
function exportCSV() {
    if (!currentAnalysis) {
        showMessage(
            "Calculate a 4PL curve before exporting.",
            "error"
        );
        return;
    }
    const {
        parameters,
        x,
        y,
        predictions,
        residuals,
        rSquared,
        rmse,
        sse,
        unknowns = []
    } = currentAnalysis;
    const rows = [];
    rows.push([
        "Type",
        "Sample",
        "Concentration",
        "Response",
        "Predicted Response",
        "Residual",
        "Calculated Concentration",
        "Status"
    ]);
    for (
        let i = 0;
        i < x.length;
        i++
    ) {
        rows.push([
            "Standard",
            `Standard ${i + 1}`,
            x[i],
            y[i],
            predictions[i],
            residuals[i],
            "",
            ""
        ]);
    }
    for (
        const unknown of unknowns
    ) {
        rows.push([
            "Unknown",
            unknown.sample,
            "",
            unknown.response,
            "",
            "",
            Number.isFinite(
                unknown.concentration
            )
                ? unknown.concentration
                : "",
            unknown.status
        ]);
    }
    rows.push([]);
    rows.push([
        "Parameter",
        "Value"
    ]);
    rows.push([
        "A",
        parameters.A
    ]);
    rows.push([
        "B",
        parameters.B
    ]);
    rows.push([
        "C",
        parameters.C
    ]);
    rows.push([
        "D",
        parameters.D
    ]);
    rows.push([
        "R²",
        rSquared
    ]);
    rows.push([
        "RMSE",
        rmse
    ]);
    rows.push([
        "SSE",
        sse
    ]);
    const csv =
        rows
            .map(
                row =>
                    row
                        .map(
                            csvEscape
                        )
                        .join(",")
            )
            .join("\r\n");
    const blob =
        new Blob(
            [csv],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );
    const url =
        URL.createObjectURL(
            blob
        );
    const link =
        document.createElement(
            "a"
        );
    link.href =
        url;
    link.download =
        `4PL_results_${new Date()
            .toISOString()
            .slice(0, 10)}.csv`;
    document.body.appendChild(
        link
    );
    link.click();
    document.body.removeChild(
        link
    );
    URL.revokeObjectURL(
        url
    );
}
function csvEscape(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }
    const stringValue =
        String(value);
    if (
        /[",\r\n]/.test(
            stringValue
        )
    ) {
        return `"${stringValue.replace(
            /"/g,
            '""'
        )}"`;
    }
    return stringValue;
}
/* ============================================================
   FORMATTING / MESSAGES
   ============================================================ */
function formatNumber(
    value,
    decimals = 6
) {
    if (
        !Number.isFinite(value)
    ) {
        return "—";
    }
    if (
        value === 0
    ) {
        return "0";
    }
    const absolute =
        Math.abs(value);
    if (
        absolute >= 1e6 ||
        absolute < 1e-4
    ) {
        return value.toExponential(
            Math.min(
                decimals,
                6
            )
        );
    }
    return value.toFixed(
        decimals
    );
}
function escapeHtml(value) {
    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}
function showMessage(
    message,
    type = "error"
) {
    let element =
        document.getElementById(
            "appMessage"
        );
    if (!element) {
        element =
            document.createElement(
                "div"
            );
        element.id =
            "appMessage";
        const container =
            document.querySelector(
                ".container"
            );
        if (container) {
            container.prepend(
                element
            );
        }
    }
    element.className =
        type === "error"
            ? "warning"
            : "success";
    element.textContent =
        message;
}
function clearMessage() {
    const element =
        document.getElementById(
            "appMessage"
        );
    if (element) {
        element.remove();
    }
}
/* ============================================================
   INITIALISE
   ============================================================ */
document.addEventListener(
    "DOMContentLoaded",
    () => {
        setupUnknownSamplesUI();
        const button =
            document.querySelector(
                'button[onclick="calculate4PL()"]'
            );
        if (button) {
            button.onclick =
                calculate4PL;
            button.removeAttribute(
                "onclick"
            );
        }
    }
);