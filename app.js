“use strict”;

/* ============================================================
LAB CALCULATOR

4PL MODEL
y = D + (A - D) / (1 + (x / C)^B)

Features:

* Excel / Google Sheets paste support
* Standard curve spreadsheet
* Prediction spreadsheet
* 4PL inverse calculation
* Prediction for invertible models
* N/A for models that cannot be reliably inverted
* Copy prediction results to Excel
* Existing results/chart UI preserved
* No duplicate event listeners
    ============================================================ */

/* ============================================================
GLOBAL STATE
============================================================ */

let lastX = null;
let lastY = null;
let lastResult = null;

let myFitChart = null;

/* ============================================================
GENERAL HELPERS
============================================================ */

function formatNumber(value, significant = 8) {
if (!Number.isFinite(value)) return “N/A”;

if (value === 0) return "0";
const abs = Math.abs(value);
if (abs >= 1e6 || abs < 1e-4) {
    return value.toExponential(Math.max(1, significant - 1));
}
return Number(value.toPrecision(significant)).toString();

}

function escapeHtml(value) {
return String(value)
.replace(/&/g, “&”)
.replace(/</g, “<”)
.replace(/>/g, “>”)
.replace(/”/g, “"”)
.replace(/’/g, “'”);
}

/* ============================================================
STANDARD CURVE SPREADSHEET
============================================================ */

function initSpreadsheet(rowCount = 8) {
const tbody = document.getElementById(“dataTableBody”);

if (!tbody) return;
tbody.innerHTML = "";
for (let i = 0; i < rowCount; i++) {
    addSpreadsheetRow(tbody, i + 1);
}
updateDataCount();

}

function addSpreadsheetRow(tbody, rowNum, xVal = “”, yVal = “”) {
const tr = document.createElement(“tr”);

tr.innerHTML = `
    <td class="row-number">${rowNum}</td>
    <td contenteditable="true" class="cell cell-x">${escapeHtml(xVal)}</td>
    <td contenteditable="true" class="cell cell-y">${escapeHtml(yVal)}</td>
`;
tbody.appendChild(tr);

}

/* ============================================================
STANDARD CURVE DATA PARSING
============================================================ */

function parseSpreadsheetTable() {
const rows = document.querySelectorAll(”#dataTableBody tr”);

const xValues = [];
const yValues = [];
rows.forEach((tr, index) => {
    const xText =
        tr.querySelector(".cell-x")?.textContent.trim() || "";
    const yText =
        tr.querySelector(".cell-y")?.textContent.trim() || "";
    // Completely blank row
    if (xText === "" && yText === "") {
        return;
    }
    const x = Number(xText);
    const y = Number(yText);
    if (!Number.isFinite(x)) {
        throw new Error(
            `Invalid concentration on row ${index + 1}: "${xText}".`
        );
    }
    if (!Number.isFinite(y)) {
        throw new Error(
            `Invalid response on row ${index + 1}: "${yText}".`
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
return {
    xValues,
    yValues
};

}

/* ============================================================
WEIGHTING
============================================================ */

function getWeights(xValues, yValues, strategy) {

return yValues.map((y, i) => {
    const x = xValues[i];
    switch (strategy) {
        case "invY":
            return y !== 0 ? 1 / Math.abs(y) : 1;
        case "invY2":
            return y !== 0 ? 1 / (y * y) : 1;
        case "invX":
            return x !== 0 ? 1 / Math.abs(x) : 1;
        case "invX2":
            return x !== 0 ? 1 / (x * x) : 1;
        default:
            return 1;
    }
});

}

/* ============================================================
MATRIX SOLVER
============================================================ */

function solveMatrix(A, B) {

const n = A.length;
for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
        if (
            Math.abs(A[k][i]) >
            Math.abs(A[maxRow][i])
        ) {
            maxRow = k;
        }
    }
    [A[i], A[maxRow]] =
        [A[maxRow], A[i]];
    [B[i], B[maxRow]] =
        [B[maxRow], B[i]];
    if (Math.abs(A[i][i]) < 1e-12) {
        continue;
    }
    for (let k = i + 1; k < n; k++) {
        const c =
            -A[k][i] / A[i][i];
        for (let j = i; j < n; j++) {
            if (i === j) {
                A[k][j] = 0;
            } else {
                A[k][j] +=
                    c * A[i][j];
            }
        }
        B[k] += c * B[i];
    }
}
const x =
    new Array(n).fill(0);
for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
        sum += A[i][j] * x[j];
    }
    x[i] =
        (B[i] - sum) /
        (A[i][i] || 1);
}
return x;

}

/* ============================================================

1. LINEAR
    y = mx + c
    ============================================================ */

function fitLinear(xValues, yValues, weights) {

let sw = 0;
let swx = 0;
let swy = 0;
let swxx = 0;
let swxy = 0;
const wArr =
    weights ||
    xValues.map(() => 1);
for (let i = 0; i < xValues.length; i++) {
    const x = xValues[i];
    const y = yValues[i];
    const w = wArr[i];
    sw += w;
    swx += w * x;
    swy += w * y;
    swxx += w * x * x;
    swxy += w * x * y;
}
const denom =
    sw * swxx -
    swx * swx;
if (Math.abs(denom) < 1e-12) {
    const avgY =
        swy / (sw || 1);
    return {
        type: "linear",
        params: {
            slope: 0,
            intercept: avgY,
            m: 0,
            c: avgY
        },
        predict: () => avgY,
        inverse: () => null,
        equation: `y = ${avgY}`
    };
}
const m =
    (sw * swxy -
        swx * swy) /
    denom;
const c =
    (swy * swxx -
        swx * swxy) /
    denom;
const sign =
    c >= 0 ? "+" : "-";
return {
    type: "linear",
    params: {
        slope: m,
        intercept: c,
        m: m,
        c: c
    },
    predict: x =>
        m * x + c,
    inverse: y => {
        if (Math.abs(m) < 1e-12) {
            return null;
        }
        return (y - c) / m;
    },
    equation:
        `y = ${m}x ${sign} ${Math.abs(c)}`
};

}

/* ============================================================
2. QUADRATIC
y = ax² + bx + c
============================================================ */

function fitQuadratic(xValues, yValues, weights) {

let sw = 0;
let swx = 0;
let swx2 = 0;
let swx3 = 0;
let swx4 = 0;
let swy = 0;
let swxy = 0;
let swx2y = 0;
for (let i = 0; i < xValues.length; i++) {
    const x = xValues[i];
    const y = yValues[i];
    const w = weights[i];
    const x2 = x * x;
    sw += w;
    swx += w * x;
    swx2 += w * x2;
    swx3 += w * x2 * x;
    swx4 += w * x2 * x2;
    swy += w * y;
    swxy += w * x * y;
    swx2y += w * x2 * y;
}
const A = [
    [swx4, swx3, swx2],
    [swx3, swx2, swx],
    [swx2, swx, sw]
];
const B = [
    swx2y,
    swxy,
    swy
];
const [a, b, c] =
    solveMatrix(A, B);
return {
    type: "quadratic",
    params: {
        a,
        b,
        c
    },
    predict: x =>
        a * x * x +
        b * x +
        c,
    inverse: y => {
        // ax² + bx + c - y = 0
        const discriminant =
            b * b -
            4 * a * (c - y);
        if (discriminant < 0) {
            return null;
        }
        const sqrtD =
            Math.sqrt(discriminant);
        const x1 =
            (-b + sqrtD) /
            (2 * a);
        const x2 =
            (-b - sqrtD) /
            (2 * a);
        const candidates =
            [x1, x2]
                .filter(Number.isFinite);
        if (!candidates.length) {
            return null;
        }
        // Prefer positive concentration
        const positive =
            candidates.filter(x => x >= 0);
        if (positive.length) {
            return positive[0];
        }
        return candidates[0];
    },
    equation:
        `y = ${a}x² + ${b}x + ${c}`
};

}

/* ============================================================
3. CUBIC
y = ax³ + bx² + cx + d
============================================================ */

function fitCubic(xValues, yValues, weights) {

const s =
    new Array(7).fill(0);
const sy =
    new Array(4).fill(0);
for (let i = 0; i < xValues.length; i++) {
    const x = xValues[i];
    const y = yValues[i];
    const w = weights[i];
    let xPow = w;
    for (let j = 0; j <= 6; j++) {
        s[j] += xPow;
        if (j < 4) {
            sy[j] +=
                xPow * y;
        }
        xPow *= x;
    }
}
const A = [
    [s[6], s[5], s[4], s[3]],
    [s[5], s[4], s[3], s[2]],
    [s[4], s[3], s[2], s[1]],
    [s[3], s[2], s[1], s[0]]
];
const B = [
    sy[3],
    sy[2],
    sy[1],
    sy[0]
];
const [a, b, c, d] =
    solveMatrix(A, B);
return {
    type: "cubic",
    params: {
        a,
        b,
        c,
        d
    },
    predict: x =>
        a * Math.pow(x, 3) +
        b * Math.pow(x, 2) +
        c * x +
        d,
    // Cubic inversion is possible mathematically,
    // but multiple real roots can exist. We therefore
    // deliberately do not provide a generic inverse.
    inverse: () => null,
    equation:
        `y = ${a}x³ + ${b}x² + ${c}x + ${d}`
};

}

/* ============================================================
4. 4PL
y = D + (A - D) / (1 + (x / C)^B)
============================================================ */

function fit4PL(
xValues,
yValues,
weights,
constrained = false
) {

const minY =
    Math.min(...yValues);
const maxY =
    Math.max(...yValues);
const minX =
    Math.min(...xValues);
const maxX =
    Math.max(...xValues);
let A =
    minY * 0.9;
let B =
    1.0;
let C =
    (minX + maxX) / 2;
let D =
    maxY * 1.1;
const evaluate =
    (x, a, b, c, d) => {
        const ratio =
            Math.max(x, 1e-12) /
            Math.max(c, 1e-12);
        return d +
            (a - d) /
            (1 + Math.pow(ratio, b));
    };
const getSSR =
    (a, b, c, d) => {
        let sum = 0;
        for (
            let i = 0;
            i < xValues.length;
            i++
        ) {
            const pred =
                evaluate(
                    xValues[i],
                    a,
                    b,
                    c,
                    d
                );
            const w =
                weights ?
                    weights[i] :
                    1;
            sum +=
                w *
                Math.pow(
                    yValues[i] - pred,
                    2
                );
        }
        return sum;
    };
let bestSSR =
    getSSR(A, B, C, D);
let stepA =
    (maxY - minY) * 0.1;
let stepB =
    0.1;
let stepC =
    (maxX - minX) * 0.1;
let stepD =
    (maxY - minY) * 0.1;
for (
    let iter = 0;
    iter < 3000;
    iter++
) {
    let improved = false;
    const params = [
        {
            name: "A",
            val: A,
            step: stepA,
            set: v => {
                A = constrained
                    ? Math.max(
                        minY * 0.5,
                        Math.min(maxY, v)
                    )
                    : v;
            }
        },
        {
            name: "B",
            val: B,
            step: stepB,
            set: v => {
                B =
                    Math.max(
                        0.01,
                        Math.min(10, v)
                    );
            }
        },
        {
            name: "C",
            val: C,
            step: stepC,
            set: v => {
                C = constrained
                    ? Math.max(
                        minX * 0.1,
                        Math.min(
                            maxX * 10,
                            v
                        )
                    )
                    : Math.max(
                        1e-12,
                        v
                    );
            }
        },
        {
            name: "D",
            val: D,
            step: stepD,
            set: v => {
                D = constrained
                    ? Math.max(
                        minY,
                        Math.min(
                            maxY * 2.0,
                            v
                        )
                    )
                    : v;
            }
        }
    ];
    for (const p of params) {
        for (const dir of [1, -1]) {
            const testVal =
                p.val +
                dir * p.step;
            const oldVal =
                p.val;
            p.set(testVal);
            const ssr =
                getSSR(
                    A,
                    B,
                    C,
                    D
                );
            if (ssr < bestSSR) {
                bestSSR =
                    ssr;
                improved =
                    true;
                break;
            } else {
                p.set(oldVal);
            }
        }
    }
    if (!improved) {
        stepA *= 0.5;
        stepB *= 0.5;
        stepC *= 0.5;
        stepD *= 0.5;
        if (stepA < 1e-12) {
            break;
        }
    }
}
/* --------------------------------------------------------
   4PL inverse
   y = D + (A-D)/(1+(x/C)^B)
   Rearranged:
   (A-y)/(y-D) - 1 = (x/C)^B
   x = C * [((A-y)/(y-D))-1]^(1/B)
-------------------------------------------------------- */
const inverse =
    y => {
        if (
            !Number.isFinite(y) ||
            !Number.isFinite(A) ||
            !Number.isFinite(B) ||
            !Number.isFinite(C) ||
            !Number.isFinite(D)
        ) {
            return null;
        }
        if (
            B <= 0 ||
            C <= 0
        ) {
            return null;
        }
        // Determine response range of the fitted curve.
        const lower =
            Math.min(A, D);
        const upper =
            Math.max(A, D);
        // Y outside asymptotic range
        if (
            y < lower ||
            y > upper
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
        const numerator =
            A - y;
        const ratio =
            numerator /
            denominator;
        const base =
            ratio - 1;
        if (
            !Number.isFinite(base) ||
            base <= 0
        ) {
            return null;
        }
        const x =
            C *
            Math.pow(
                base,
                1 / B
            );
        if (
            !Number.isFinite(x) ||
            x < 0
        ) {
            return null;
        }
        return x;
    };
return {
    type: "4pl",
    params: {
        bottom: A,
        hillSlope: B,
        ic50: C,
        top: D
    },
    predict: x =>
        evaluate(
            x,
            A,
            B,
            C,
            D
        ),
    inverse,
    equation:
        `y = ${D} + (${A} - ${D}) / (1 + (x / ${C})^${B})`
};

}

/* ============================================================
5. 5PL
============================================================ */

function fit5PL(
xValues,
yValues,
weights
) {

const minY =
    Math.min(...yValues);
const maxY =
    Math.max(...yValues);
const minX =
    Math.min(...xValues);
const maxX =
    Math.max(...xValues);
let A =
    minY;
let D =
    maxY;
let C =
    minX +
    (maxX - minX) / 2;
let B =
    1.0;
let G =
    1.0;
const evaluate =
    (x, a, b, c, d, g) =>
        d +
        (a - d) /
        Math.pow(
            1 +
            Math.pow(
                Math.max(x, 1e-9) /
                Math.max(c, 1e-9),
                b
            ),
            g
        );
for (
    let iter = 0;
    iter < 250;
    iter++
) {
    for (
        let i = 0;
        i < xValues.length;
        i++
    ) {
        const x =
            xValues[i];
        const y =
            yValues[i];
        const w =
            weights[i];
        const pred =
            evaluate(
                x,
                A,
                B,
                C,
                D,
                G
            );
        const err =
            (y - pred) * w;
        A +=
            err * 0.004;
        D +=
            err * 0.004;
        if (x > 0) {
            C +=
                err *
                0.002 *
                C;
        }
        G +=
            err * 0.001;
    }
}
return {
    type: "5pl",
    params: {
        bottom: A,
        top: D,
        ic50: C,
        hillSlope: B,
        asymmetry: G
    },
    predict: x =>
        evaluate(
            x,
            A,
            B,
            C,
            D,
            G
        ),
    // 5PL inversion is deliberately disabled here.
    // The fitted G/B parameters can produce unstable
    // inversions with this iterative fitting method.
    inverse: () => null,
    equation:
        `y = ${D} + (${A} - ${D}) / (1 + (x / ${C})^${B})^${G}`
};

}

/* ============================================================
6. MICHAELIS-MENTEN
y = Vmax*x/(Km+x)
============================================================ */

function fitMichaelisMenten(
xValues,
yValues,
weights
) {

let Vmax =
    Math.max(...yValues);
let Km =
    Math.max(...xValues) / 2;
const evaluate =
    (x, v, k) =>
        (v * x) /
        (k + x);
for (
    let iter = 0;
    iter < 200;
    iter++
) {
    for (
        let i = 0;
        i < xValues.length;
        i++
    ) {
        const x =
            xValues[i];
        const y =
            yValues[i];
        const w =
            weights[i];
        const pred =
            evaluate(
                x,
                Vmax,
                Km
            );
        const err =
            (y - pred) * w;
        Vmax +=
            err * 0.01;
        Km +=
            err *
            0.005 *
            Km;
    }
}
return {
    type:
        "michaelisMenten",
    params: {
        Vmax,
        Km
    },
    predict: x =>
        evaluate(
            x,
            Vmax,
            Km
        ),
    inverse: y => {
        // y = Vmax*x/(Km+x)
        //
        // x = y*Km/(Vmax-y)
        if (
            !Number.isFinite(y) ||
            !Number.isFinite(Vmax) ||
            !Number.isFinite(Km)
        ) {
            return null;
        }
        if (
            Vmax <= 0 ||
            Km <= 0 ||
            y < 0 ||
            y >= Vmax
        ) {
            return null;
        }
        const x =
            (y * Km) /
            (Vmax - y);
        return Number.isFinite(x)
            ? x
            : null;
    },
    equation:
        `y = (${Vmax} * x) / (${Km} + x)`
};

}

/* ============================================================
7. EXPONENTIAL GROWTH
y = A * e^(kx)
============================================================ */

function fitExpGrowth(
xValues,
yValues,
weights
) {

const logY =
    yValues.map(
        y =>
            Math.log(
                Math.max(
                    y,
                    1e-6
                )
            )
    );
const lin =
    fitLinear(
        xValues,
        logY,
        weights
    );
const A =
    Math.exp(
        lin.params.intercept
    );
const k =
    lin.params.slope;
return {
    type:
        "expGrowth",
    params: {
        A,
        k
    },
    predict: x =>
        A *
        Math.exp(k * x),
    inverse: y => {
        if (
            y <= 0 ||
            A <= 0 ||
            Math.abs(k) < 1e-12
        ) {
            return null;
        }
        const x =
            Math.log(y / A) /
            k;
        return Number.isFinite(x)
            ? x
            : null;
    },
    equation:
        `y = ${A} * e^(${k}x)`
};

}

/* ============================================================
8. EXPONENTIAL DECAY
y = A * e^(-kx) + C
============================================================ */

function fitExpDecay(
xValues,
yValues,
weights
) {

const minY =
    Math.min(...yValues);
const offset =
    minY > 0
        ? minY * 0.5
        : 0;
const logY =
    yValues.map(
        y =>
            Math.log(
                Math.max(
                    y - offset,
                    1e-6
                )
            )
    );
const lin =
    fitLinear(
        xValues,
        logY,
        weights
    );
const A =
    Math.exp(
        lin.params.intercept
    );
const k =
    Math.abs(
        lin.params.slope
    );
return {
    type:
        "expDecay",
    params: {
        A,
        k,
        offset
    },
    predict: x =>
        A *
        Math.exp(-k * x) +
        offset,
    inverse: y => {
        if (
            y <= offset ||
            A <= 0 ||
            k <= 0
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
        const x =
            -Math.log(inner) /
            k;
        return Number.isFinite(x)
            ? x
            : null;
    },
    equation:
        `y = ${A} * e^(-${k}x) + ${offset}`
};

}

/* ============================================================
9. GAUSSIAN
============================================================ */

function fitGaussian(
xValues,
yValues,
weights
) {

let Amp =
    Math.max(...yValues);
let Mean =
    xValues[
        yValues.indexOf(Amp)
    ] || 0;
let SD =
    (Math.max(...xValues) -
        Math.min(...xValues)) / 4;
const evaluate =
    (x, amp, mean, sd) =>
        amp *
        Math.exp(
            -Math.pow(
                x - mean,
                2
            ) /
            (
                2 *
                Math.pow(
                    sd,
                    2
                )
            )
        );
for (
    let iter = 0;
    iter < 250;
    iter++
) {
    for (
        let i = 0;
        i < xValues.length;
        i++
    ) {
        const x =
            xValues[i];
        const y =
            yValues[i];
        const w =
            weights[i];
        const pred =
            evaluate(
                x,
                Amp,
                Mean,
                SD
            );
        const err =
            (y - pred) * w;
        Amp +=
            err * 0.01;
        Mean +=
            err * 0.005;
        SD +=
            err * 0.002;
    }
}
return {
    type:
        "gaussian",
    params: {
        Amp,
        Mean,
        SD
    },
    predict: x =>
        evaluate(
            x,
            Amp,
            Mean,
            SD
        ),
    // A Gaussian can technically be inverted,
    // but it has two possible X values for most Y
    // values. We therefore do not automatically choose
    // one and instead report N/A.
    inverse: () => null,
    equation:
        `y = ${Amp} * e^(-(x - ${Mean})² / (2 * ${SD}²))`
};

}

/* ============================================================
FIT STATISTICS
============================================================ */

function calculateFitStats(
xValues,
yValues,
result
) {

const n =
    xValues.length;
const k =
    Object.keys(
        result.params || {}
    ).length;
const dof =
    Math.max(
        1,
        n - k
    );
const meanY =
    yValues.reduce(
        (a, b) => a + b,
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
            yValues[i] -
            meanY,
            2
        );
    ssRes +=
        Math.pow(
            yValues[i] -
            result.predict(
                xValues[i]
            ),
            2
        );
}
const r2 =
    ssTot === 0
        ? 1
        : Math.max(
            0,
            1 - ssRes / ssTot
        );
const adjR2 =
    n > k
        ? 1 -
            (
                (1 - r2) *
                (n - 1) /
                (n - k)
            )
        : r2;
const sse =
    ssRes;
const se =
    Math.sqrt(
        sse / dof
    );
const msReg =
    (ssTot - ssRes) /
    (k - 1 || 1);
const msRes =
    sse / dof;
const fStat =
    msRes > 0
        ? msReg / msRes
        : 0;
// Existing simplified approximation retained.
const pValue =
    fStat > 0
        ? Math.exp(
            -0.5 * fStat
        )
        : 1;
const sigma2 =
    sse / n;
const aic =
    sigma2 > 0
        ? n *
            Math.log(sigma2) +
            2 * k
        : 0;
const bic =
    sigma2 > 0
        ? n *
            Math.log(sigma2) +
            k *
            Math.log(n)
        : 0;
const aicc =
    (n - k - 1) > 0
        ? aic +
            (
                2 *
                k *
                (k + 1)
            ) /
            (n - k - 1)
        : aic;
return {
    r2,
    adjR2,
    pValue,
    se,
    sse,
    fStat,
    aic,
    bic,
    dof,
    aicc
};

}

/* ============================================================
CLIPBOARD HELPERS
============================================================ */

function copySectionText(
button,
textToCopy
) {

navigator.clipboard
    .writeText(textToCopy)
    .then(() => {
        const originalText =
            button.innerHTML;
        button.innerHTML =
            "✓ Copied";
        button.classList.add(
            "copied"
        );
        setTimeout(() => {
            button.innerHTML =
                originalText;
            button.classList.remove(
                "copied"
            );
        }, 1500);
    })
    .catch(err => {
        console.error(
            "Failed to copy text:",
            err
        );
    });

}

/* ============================================================
COPY PARAMETERS
============================================================ */

function copyParametersText(button) {

const cards =
    document.querySelectorAll(
        "#parameterGrid .parameter-card"
    );
const rows = [];
rows.push(
    [
        "Parameter",
        "Description",
        "Value"
    ].join("\t")
);
cards.forEach(card => {
    const name =
        card.querySelector(
            ".parameter-name"
        )?.textContent.trim() || "";
    const label =
        card.querySelector(
            ".parameter-label"
        )?.textContent.trim() || "";
    const value =
        card.querySelector(
            "strong"
        )?.textContent.trim() || "";
    rows.push(
        [
            name,
            label,
            value
        ].join("\t")
    );
});
copySectionText(
    button,
    rows.join("\n")
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
if (!tbody) return;
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
sample = “”,
yVal = “”,
xVal = “”
) {

const tr =
    document.createElement("tr");
tr.innerHTML = `
    <td class="row-number">
        ${rowNum}
    </td>
    <td
        contenteditable="true"
        class="cell cell-sample"
    >${escapeHtml(sample)}</td>
    <td
        contenteditable="true"
        class="cell cell-predict-y"
    >${escapeHtml(yVal)}</td>
    <td class="cell cell-predict-x">
        ${escapeHtml(xVal)}
    </td>
`;
tbody.appendChild(tr);

}

/* ============================================================
PREDICTION TABLE HEADER SUPPORT
============================================================ */

function ensurePredictionColumnHeader() {

const table =
    document.getElementById(
        "predictTable"
    );
if (!table) return;
const headerRows =
    table.querySelectorAll(
        "thead tr"
    );
const headerRow =
    headerRows[
        headerRows.length - 1
    ];
if (!headerRow) return;
const existing =
    headerRow.querySelector(
        ".prediction-x-header"
    );
if (existing) return;
const th =
    document.createElement("th");
th.className =
    "prediction-x-header";
th.textContent =
    "Predicted X";
headerRow.appendChild(th);
const lettersRow =
    headerRows[0];
if (lettersRow) {
    const letter =
        document.createElement("th");
    letter.className =
        "column-letter";
    letter.textContent =
        "C";
    lettersRow.appendChild(
        letter
    );
}

}

/* ============================================================
PARSE PREDICTION TABLE
============================================================ */

function parsePredictionTable() {

const rows =
    document.querySelectorAll(
        "#predictTableBody tr"
    );
const predictions = [];
rows.forEach(
    (tr, index) => {
        const sample =
            tr.querySelector(
                ".cell-sample"
            )?.textContent.trim() || "";
        const yText =
            tr.querySelector(
                ".cell-predict-y"
            )?.textContent.trim() || "";
        if (
            sample === "" &&
            yText === ""
        ) {
            return;
        }
        if (yText === "") {
            predictions.push({
                row: index + 1,
                sample,
                y: null
            });
            return;
        }
        const y =
            Number(yText);
        if (!Number.isFinite(y)) {
            throw new Error(
                `Invalid prediction response on row ${index + 1}: "${yText}".`
            );
        }
        predictions.push({
            row: index + 1,
            sample,
            y
        });
    }
);
return predictions;

}

/* ============================================================
UPDATE PREDICTION COUNT
============================================================ */

function updatePredictionCount() {

const countEl =
    document.getElementById(
        "predictCount"
    );
if (!countEl) return;
const rows =
    document.querySelectorAll(
        "#predictTableBody tr"
    );
let count = 0;
rows.forEach(tr => {
    const sample =
        tr.querySelector(
            ".cell-sample"
        )?.textContent.trim() || "";
    const y =
        tr.querySelector(
            ".cell-predict-y"
        )?.textContent.trim() || "";
    if (
        sample !== "" ||
        y !== ""
    ) {
        count++;
    }
});
countEl.textContent =
    `${count} sample${count === 1 ? "" : "s"}`;

}

/* ============================================================
PREDICT USING FITTED MODEL
============================================================ */

function predictFromResult(
result,
y
) {

if (
    !result ||
    typeof result.inverse !== "function"
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
        "Prediction inversion failed:",
        error
    );
    return null;
}

}

/* ============================================================
UPDATE PREDICTION RESULTS
============================================================ */

function updatePredictions(
result = lastResult
) {

const tbody =
    document.getElementById(
        "predictTableBody"
    );
if (!tbody) return;
const rows =
    tbody.querySelectorAll(
        "tr"
    );
rows.forEach(tr => {
    const yText =
        tr.querySelector(
            ".cell-predict-y"
        )?.textContent.trim() || "";
    const output =
        tr.querySelector(
            ".cell-predict-x"
        );
    if (!output) return;
    if (
        yText === "" ||
        !result
    ) {
        output.textContent =
            "";
        output.classList.remove(
            "prediction-na"
        );
        return;
    }
    const y =
        Number(yText);
    if (!Number.isFinite(y)) {
        output.textContent =
            "N/A";
        output.classList.add(
            "prediction-na"
        );
        return;
    }
    const x =
        predictFromResult(
            result,
            y
        );
    if (x === null) {
        output.textContent =
            "N/A";
        output.classList.add(
            "prediction-na"
        );
        return;
    }
    output.textContent =
        formatNumber(x);
    output.classList.remove(
        "prediction-na"
    );
});
updatePredictionCount();

}

/* ============================================================
COPY PREDICTIONS TO EXCEL
============================================================ */

function copyPredictionsText(button) {

const rows = [];
rows.push(
    [
        "Sample",
        "Response (Y)",
        "Predicted X"
    ].join("\t")
);
const tableRows =
    document.querySelectorAll(
        "#predictTableBody tr"
    );
tableRows.forEach(tr => {
    const sample =
        tr.querySelector(
            ".cell-sample"
        )?.textContent.trim() || "";
    const y =
        tr.querySelector(
            ".cell-predict-y"
        )?.textContent.trim() || "";
    const x =
        tr.querySelector(
            ".cell-predict-x"
        )?.textContent.trim() || "";
    if (
        sample === "" &&
        y === "" &&
        x === ""
    ) {
        return;
    }
    rows.push(
        [
            sample,
            y,
            x
        ].join("\t")
    );
});
copySectionText(
    button,
    rows.join("\n")
);

}

/* ============================================================
DISPLAY RESULTS
============================================================ */

function displayResults(
result,
xValues,
yValues
) {

const resultsCard =
    document.getElementById(
        "results"
    );
const paramsDiv =
    document.getElementById(
        "parameters"
    );
const pointCountSpan =
    document.getElementById(
        "pointCount"
    );
if (
    !resultsCard ||
    !paramsDiv
) {
    return;
}
resultsCard.classList.remove(
    "hidden"
);
if (pointCountSpan) {
    pointCountSpan.textContent =
        `${xValues.length} Points Fitted`;
}
const stats =
    calculateFitStats(
        xValues,
        yValues,
        result
    );
const p =
    result.params;
/* --------------------------------------------------------
   PARAMETERS
-------------------------------------------------------- */
let paramsHTML = `
    <div
        class="section-header"
        style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:8px;
        "
    >
        <h4
            style="
                margin:0;
                color:#1e293b;
                font-size:0.95rem;
            "
        >
            Model Parameters
        </h4>
        <button
            class="btn-copy-mini"
            onclick="copyParametersText(this)"
        >
            Copy
        </button>
    </div>
    <div
        class="parameter-grid"
        id="parameterGrid"
    >
`;
if (
    result.type === "4pl" ||
    result.type === "5pl"
) {
    paramsHTML += `
        <div class="parameter-card">
            <span class="parameter-name">
                A
            </span>
            <span class="parameter-label">
                Bottom
            </span>
            <strong>
                ${formatNumber(p.bottom)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                B
            </span>
            <span class="parameter-label">
                Hill Slope
            </span>
            <strong>
                ${formatNumber(p.hillSlope)}
            </strong>
        </div>
        <div class="parameter-card highlight">
            <span class="parameter-name">
                C
            </span>
            <span class="parameter-label">
                EC50 / IC50
            </span>
            <strong>
                ${formatNumber(p.ic50)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                D
            </span>
            <span class="parameter-label">
                Top
            </span>
            <strong>
                ${formatNumber(p.top)}
            </strong>
        </div>
    `;
    if (result.type === "5pl") {
        paramsHTML += `
            <div class="parameter-card">
                <span class="parameter-name">
                    G
                </span>
                <span class="parameter-label">
                    Asymmetry
                </span>
                <strong>
                    ${formatNumber(p.asymmetry)}
                </strong>
            </div>
        `;
    }
} else if (
    result.type ===
    "michaelisMenten"
) {
    paramsHTML += `
        <div class="parameter-card highlight">
            <span class="parameter-name">
                Vmax
            </span>
            <span class="parameter-label">
                Max Velocity
            </span>
            <strong>
                ${formatNumber(p.Vmax)}
            </strong>
        </div>
        <div class="parameter-card highlight">
            <span class="parameter-name">
                Km
            </span>
            <span class="parameter-label">
                Michaelis Const.
            </span>
            <strong>
                ${formatNumber(p.Km)}
            </strong>
        </div>
    `;
} else if (
    result.type ===
    "gaussian"
) {
    paramsHTML += `
        <div class="parameter-card highlight">
            <span class="parameter-name">
                Amp
            </span>
            <span class="parameter-label">
                Peak Height
            </span>
            <strong>
                ${formatNumber(p.Amp)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                Mean
            </span>
            <span class="parameter-label">
                Center (x0)
            </span>
            <strong>
                ${formatNumber(p.Mean)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                SD
            </span>
            <span class="parameter-label">
                Std Deviation
            </span>
            <strong>
                ${formatNumber(p.SD)}
            </strong>
        </div>
    `;
} else if (
    result.type ===
    "cubic"
) {
    paramsHTML += `
        <div class="parameter-card">
            <span class="parameter-name">
                a
            </span>
            <span class="parameter-label">
                x³ Coeff
            </span>
            <strong>
                ${formatNumber(p.a)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                b
            </span>
            <span class="parameter-label">
                x² Coeff
            </span>
            <strong>
                ${formatNumber(p.b)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                c
            </span>
            <span class="parameter-label">
                x Coeff
            </span>
            <strong>
                ${formatNumber(p.c)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                d
            </span>
            <span class="parameter-label">
                Intercept
            </span>
            <strong>
                ${formatNumber(p.d)}
            </strong>
        </div>
    `;
} else if (
    result.type ===
    "quadratic"
) {
    paramsHTML += `
        <div class="parameter-card">
            <span class="parameter-name">
                a
            </span>
            <span class="parameter-label">
                x² Coeff
            </span>
            <strong>
                ${formatNumber(p.a)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                b
            </span>
            <span class="parameter-label">
                x Coeff
            </span>
            <strong>
                ${formatNumber(p.b)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                c
            </span>
            <span class="parameter-label">
                Intercept
            </span>
            <strong>
                ${formatNumber(p.c)}
            </strong>
        </div>
    `;
} else if (
    result.type ===
        "expGrowth" ||
    result.type ===
        "expDecay"
) {
    paramsHTML += `
        <div class="parameter-card">
            <span class="parameter-name">
                A
            </span>
            <span class="parameter-label">
                Amplitude
            </span>
            <strong>
                ${formatNumber(p.A)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                k
            </span>
            <span class="parameter-label">
                Rate Const.
            </span>
            <strong>
                ${formatNumber(p.k)}
            </strong>
        </div>
    `;
} else {
    paramsHTML += `
        <div class="parameter-card">
            <span class="parameter-name">
                m
            </span>
            <span class="parameter-label">
                Slope
            </span>
            <strong>
                ${formatNumber(p.slope)}
            </strong>
        </div>
        <div class="parameter-card">
            <span class="parameter-name">
                c
            </span>
            <span class="parameter-label">
                Intercept
            </span>
            <strong>
                ${formatNumber(p.c)}
            </strong>
        </div>
    `;
}
paramsHTML += `
    </div>
`;
/* --------------------------------------------------------
   FIT STATISTICS
-------------------------------------------------------- */
const fitStatsExcelString = [
    [
        "Metric",
        "Value"
    ].join("\t"),
    [
        "R²",
        stats.r2.toFixed(4)
    ].join("\t"),
    [
        "aR²",
        stats.adjR2.toFixed(4)
    ].join("\t"),
    [
        "P",
        stats.pValue < 0.0001
            ? stats.pValue.toExponential(4)
            : stats.pValue.toFixed(6)
    ].join("\t"),
    [
        "SE",
        stats.se.toFixed(4)
    ].join("\t"),
    [
        "SSE",
        stats.sse.toFixed(4)
    ].join("\t"),
    [
        "F",
        stats.fStat.toFixed(1)
    ].join("\t"),
    [
        "AIC",
        stats.aic.toFixed(3)
    ].join("\t"),
    [
        "BIC",
        stats.bic.toFixed(3)
    ].join("\t"),
    [
        "DoF",
        stats.dof
    ].join("\t"),
    [
        "AICc",
        stats.aicc.toFixed(3)
    ].join("\t")
].join("\n");
paramsHTML += `
    <div
        class="fit-stats-container"
        style="
            margin-top:15px;
            background:#f8fafc;
            padding:12px;
            border-radius:8px;
            border:1px solid #e2e8f0;
        "
    >
        <div
            class="section-header"
            style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:10px;
            "
        >
            <h4
                style="
                    margin:0;
                    color:#1e293b;
                    font-size:0.95rem;
                "
            >
                Goodness of Fit
            </h4>
            <button
                class="btn-copy-mini"
                onclick="copySectionText(this, \`${fitStatsExcelString}\`)"
            >
                Copy
            </button>
        </div>
        <div
            class="fit-stats-grid"
            style="
                display:grid;
                grid-template-columns:
                    repeat(
                        auto-fit,
                        minmax(110px, 1fr)
                    );
                gap:8px;
                font-size:0.85rem;
            "
        >
            <div>
                <span>R²</span>
                <strong>
                    ${stats.r2.toFixed(4)}
                </strong>
            </div>
            <div>
                <span>aR²</span>
                <strong>
                    ${stats.adjR2.toFixed(4)}
                </strong>
            </div>
            <div>
                <span>P</span>
                <strong>
                    ${
                        stats.pValue < 0.0001
                            ? stats.pValue.toExponential(4)
                            : stats.pValue.toFixed(6)
                    }
                </strong>
            </div>
            <div>
                <span>SE</span>
                <strong>
                    ${stats.se.toFixed(4)}
                </strong>
            </div>
            <div>
                <span>SSE</span>
                <strong>
                    ${stats.sse.toFixed(4)}
                </strong>
            </div>
            <div>
                <span>F</span>
                <strong>
                    ${stats.fStat.toFixed(1)}
                </strong>
            </div>
            <div>
                <span>AIC</span>
                <strong>
                    ${stats.aic.toFixed(3)}
                </strong>
            </div>
            <div>
                <span>BIC</span>
                <strong>
                    ${stats.bic.toFixed(3)}
                </strong>
            </div>
            <div>
                <span>DoF</span>
                <strong>
                    ${stats.dof}
                </strong>
            </div>
            <div>
                <span>AICc</span>
                <strong>
                    ${stats.aicc.toFixed(3)}
                </strong>
            </div>
        </div>
    </div>
`;
/* --------------------------------------------------------
   EQUATION
-------------------------------------------------------- */
paramsHTML += `
    <div
        class="equation-box"
        style="
            margin-top:12px;
            display:flex;
            justify-content:space-between;
            align-items:center;
        "
    >
        <div
            style="
                flex-grow:1;
                margin-right:10px;
            "
        >
            <span
                style="
                    display:block;
                    font-size:0.8rem;
                    color:#64748b;
                    margin-bottom:4px;
                "
            >
                Model Equation
            </span>
            <code
                id="equationCode"
                style="
                    font-size:0.9rem;
                "
            >
                ${escapeHtml(result.equation)}
            </code>
        </div>
        <button
            class="btn-copy-mini"
            onclick="copySectionText(this, \`${result.equation}\`)"
        >
            Copy
        </button>
    </div>
`;
paramsDiv.innerHTML =
    paramsHTML;
drawChart(
    xValues,
    yValues,
    result
);
// Update prediction table
updatePredictions(result);

}

/* ============================================================
DRAW CHART
============================================================ */

function drawChart(
xValues,
yValues,
result
) {

if (
    typeof Chart ===
    "undefined"
) {
    console.warn(
        "Chart.js is not loaded."
    );
    const canvas =
        document.getElementById(
            "fitChart"
        );
    if (
        canvas &&
        canvas.parentElement
    ) {
        canvas.parentElement.innerHTML = `
            <div
                style="
                    padding:16px;
                    color:var(--danger);
                    font-family:var(--font-mono);
                    font-size:12px;
                    border:1px dashed var(--danger-border);
                    background:var(--danger-bg);
                    border-radius:3px;
                "
            >
                [Chart Error]: Chart.js library failed to load.
            </div>
        `;
    }
    return;
}
const canvas =
    document.getElementById(
        "fitChart"
    );
if (!canvas) return;
if (
    myFitChart instanceof Chart
) {
    myFitChart.destroy();
    myFitChart =
        null;
}
const minX =
    Math.min(...xValues);
const maxX =
    Math.max(...xValues);
const step =
    (maxX - minX) /
    100 || 1;
const curveData = [];
for (
    let x = minX;
    x <= maxX;
    x += step
) {
    curveData.push({
        x,
        y: result.predict(x)
    });
}
const scatterData =
    xValues.map(
        (x, i) => ({
            x,
            y: yValues[i]
        })
    );
requestAnimationFrame(
    () => {
        const ctx =
            canvas.getContext(
                "2d"
            );
        myFitChart =
            new Chart(
                ctx,
                {
                    type: "scatter",
                    data: {
                        datasets: [
                            {
                                label:
                                    "Observed Data",
                                data:
                                    scatterData,
                                backgroundColor:
                                    "#0284c7",
                                borderColor:
                                    "#0369a1",
                                pointRadius:
                                    5,
                                showLine:
                                    false
                            },
                            {
                                label:
                                    `Fitted Curve (${result.type.toUpperCase()})`,
                                data:
                                    curveData,
                                type:
                                    "line",
                                borderColor:
                                    "#dc2626",
                                borderWidth:
                                    2,
                                pointRadius:
                                    0,
                                fill:
                                    false,
                                tension:
                                    0.1
                            }
                        ]
                    },
                    options: {
                        responsive:
                            true,
                        maintainAspectRatio:
                            false,
                        scales: {
                            x: {
                                type:
                                    "linear",
                                position:
                                    "bottom"
                            }
                        }
                    }
                }
            );
    }
);

}

/* ============================================================
MASTER CALCULATION
============================================================ */

function calculate4PL() {

try {
    clearError();
    const {
        xValues,
        yValues
    } =
        parseSpreadsheetTable();
    const modelType =
        document.getElementById(
            "fitModel"
        )?.value ||
        "4pl_unconstrained";
    const weightType =
        document.getElementById(
            "weighting"
        )?.value ||
        "none";
    const weights =
        getWeights(
            xValues,
            yValues,
            weightType
        );
    let result;
    switch (modelType) {
        case "linear":
            result =
                fitLinear(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "quadratic":
            result =
                fitQuadratic(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "cubic":
            result =
                fitCubic(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "4pl_constrained":
            result =
                fit4PL(
                    xValues,
                    yValues,
                    weights,
                    true
                );
            break;
        case "4pl_unconstrained":
            result =
                fit4PL(
                    xValues,
                    yValues,
                    weights,
                    false
                );
            break;
        case "5pl":
            result =
                fit5PL(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "michaelisMenten":
            result =
                fitMichaelisMenten(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "expGrowth":
            result =
                fitExpGrowth(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "expDecay":
            result =
                fitExpDecay(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "gaussian":
            result =
                fitGaussian(
                    xValues,
                    yValues,
                    weights
                );
            break;
        case "4pl":
        default:
            result =
                fit4PL(
                    xValues,
                    yValues,
                    weights,
                    false
                );
            break;
    }
    lastX =
        xValues;
    lastY =
        yValues;
    lastResult =
        result;
    displayResults(
        result,
        xValues,
        yValues
    );
} catch (error) {
    console.error(
        "Calculation error:",
        error
    );
    showError(
        error.message
    );
}

}

/* ============================================================
DATA COUNT
============================================================ */

function updateDataCount() {

const countEl =
    document.getElementById(
        "dataCount"
    );
if (!countEl) return;
try {
    const {
        xValues
    } =
        parseSpreadsheetTable();
    countEl.textContent =
        `${xValues.length} data point${xValues.length === 1 ? "" : "s"}`;
} catch {
    countEl.textContent =
        "0 data points";
}

}

/* ============================================================
ERROR HANDLING
============================================================ */

function showError(message) {

const errorBox =
    document.getElementById(
        "inputError"
    );
if (!errorBox) return;
errorBox.textContent =
    message;
errorBox.classList.remove(
    "hidden"
);

}

function clearError() {

const errorBox =
    document.getElementById(
        "inputError"
    );
if (!errorBox) return;
errorBox.textContent =
    "";
errorBox.classList.add(
    "hidden"
);

}

/* ============================================================
CLEAR CALCULATOR
============================================================ */

function clearCalculator() {

initSpreadsheet(8);
initPredictionSpreadsheet(8);
const results =
    document.getElementById(
        "results"
    );
if (results) {
    results.classList.add(
        "hidden"
    );
}
clearError();
lastX =
    null;
lastY =
    null;
lastResult =
    null;
if (
    myFitChart instanceof Chart
) {
    myFitChart.destroy();
    myFitChart =
        null;
}

}

/* ============================================================
PASTE STANDARD CURVE DATA
============================================================ */

function handleStandardPaste(e) {

e.preventDefault();
const clipboardData =
    (
        e.clipboardData ||
        window.clipboardData
    ).getData("text");
if (!clipboardData) return;
const lines =
    clipboardData
        .trim()
        .split(/\r?\n/);
const tbody =
    document.getElementById(
        "dataTableBody"
    );
if (!tbody) return;
tbody.innerHTML =
    "";
lines.forEach(
    (line, idx) => {
        const cols =
            line.split(
                /\t|,/
            );
        const xVal =
            cols[0]
                ? cols[0].trim()
                : "";
        const yVal =
            cols[1]
                ? cols[1].trim()
                : "";
        addSpreadsheetRow(
            tbody,
            idx + 1,
            xVal,
            yVal
        );
    }
);
const minRows =
    8;
if (
    lines.length <
    minRows
) {
    for (
        let i = lines.length;
        i < minRows;
        i++
    ) {
        addSpreadsheetRow(
            tbody,
            i + 1,
            "",
            ""
        );
    }
}
updateDataCount();

}

/* ============================================================
PASTE PREDICTION DATA
============================================================ */

function handlePredictionPaste(e) {

e.preventDefault();
const clipboardData =
    (
        e.clipboardData ||
        window.clipboardData
    ).getData("text");
if (!clipboardData) return;
const lines =
    clipboardData
        .trim()
        .split(/\r?\n/);
const tbody =
    document.getElementById(
        "predictTableBody"
    );
if (!tbody) return;
tbody.innerHTML =
    "";
lines.forEach(
    (line, idx) => {
        const cols =
            line.split(
                /\t|,/
            );
        const sample =
            cols[0]
                ? cols[0].trim()
                : "";
        const yVal =
            cols[1]
                ? cols[1].trim()
                : "";
        addPredictionRow(
            tbody,
            idx + 1,
            sample,
            yVal
        );
    }
);
const minRows =
    8;
if (
    lines.length <
    minRows
) {
    for (
        let i = lines.length;
        i < minRows;
        i++
    ) {
        addPredictionRow(
            tbody,
            i + 1
        );
    }
}
updatePredictionRowNumbers();
updatePredictionCount();
updatePredictions(
    lastResult
);

}

/* ============================================================
ROW NUMBER MAINTENANCE
============================================================ */

function updatePredictionRowNumbers() {

const rows =
    document.querySelectorAll(
        "#predictTableBody tr"
    );
rows.forEach(
    (tr, index) => {
        const number =
            tr.querySelector(
                ".row-number"
            );
        if (number) {
            number.textContent =
                index + 1;
        }
    }
);

}

/* ============================================================
AUTO-EXPAND PREDICTION TABLE
============================================================ */

function ensurePredictionRows() {

const tbody =
    document.getElementById(
        "predictTableBody"
    );
if (!tbody) return;
const rows =
    tbody.querySelectorAll(
        "tr"
    );
const lastRow =
    rows[
        rows.length - 1
    ];
if (!lastRow) return;
const sample =
    lastRow.querySelector(
        ".cell-sample"
    )?.textContent.trim() || "";
const y =
    lastRow.querySelector(
        ".cell-predict-y"
    )?.textContent.trim() || "";
if (
    sample !== "" ||
    y !== ""
) {
    addPredictionRow(
        tbody,
        rows.length + 1
    );
}

}

/* ============================================================
AUTO-EXPAND STANDARD CURVE TABLE
============================================================ */

function ensureStandardRows() {

const tbody =
    document.getElementById(
        "dataTableBody"
    );
if (!tbody) return;
const rows =
    tbody.querySelectorAll(
        "tr"
    );
const lastRow =
    rows[
        rows.length - 1
    ];
if (!lastRow) return;
const x =
    lastRow.querySelector(
        ".cell-x"
    )?.textContent.trim() || "";
const y =
    lastRow.querySelector(
        ".cell-y"
    )?.textContent.trim() || "";
if (
    x !== "" ||
    y !== ""
) {
    addSpreadsheetRow(
        tbody,
        rows.length + 1
    );
}

}

/* ============================================================
DOM INITIALISATION
============================================================ */

document.addEventListener(
“DOMContentLoaded”,
() => {

    /* ----------------------------------------------------
       Initialise standard curve
    ---------------------------------------------------- */
    initSpreadsheet(8);
    /* ----------------------------------------------------
       Initialise prediction table
    ---------------------------------------------------- */
    ensurePredictionColumnHeader();
    initPredictionSpreadsheet(8);
    /* ----------------------------------------------------
       Standard curve table
    ---------------------------------------------------- */
    const table =
        document.getElementById(
            "dataTable"
        );
    if (table) {
        table.addEventListener(
            "paste",
            handleStandardPaste
        );
        table.addEventListener(
            "input",
            () => {
                updateDataCount();
                ensureStandardRows();
            }
        );
    }
    /* ----------------------------------------------------
       Prediction table
    ---------------------------------------------------- */
    const predictTable =
        document.getElementById(
            "predictTable"
        );
    if (predictTable) {
        predictTable.addEventListener(
            "paste",
            handlePredictionPaste
        );
        predictTable.addEventListener(
            "input",
            () => {
                updatePredictionCount();
                ensurePredictionRows();
                updatePredictions(
                    lastResult
                );
            }
        );
    }
    /* ----------------------------------------------------
       Buttons
    ---------------------------------------------------- */
    const calculateButton =
        document.getElementById(
            "calculateButton"
        );
    const clearButton =
        document.getElementById(
            "clearButton"
        );
    if (calculateButton) {
        calculateButton.addEventListener(
            "click",
            calculate4PL
        );
    }
    if (clearButton) {
        clearButton.addEventListener(
            "click",
            clearCalculator
        );
    }
    /* ----------------------------------------------------
       Model / weighting selectors
    ---------------------------------------------------- */
    const fitModelSelect =
        document.getElementById(
            "fitModel"
        );
    const weightingSelect =
        document.getElementById(
            "weighting"
        );
    function handleAutoUpdate() {
        try {
            calculate4PL();
        } catch {
            // Ignore incomplete datasets
        }
    }
    if (fitModelSelect) {
        fitModelSelect.addEventListener(
            "change",
            handleAutoUpdate
        );
    }
    if (weightingSelect) {
        weightingSelect.addEventListener(
            "change",
            handleAutoUpdate
        );
    }
}

);

/* ============================================================
WINDOW RESIZE
============================================================ */

window.addEventListener(
“resize”,
() => {

    if (
        lastX &&
        lastY &&
        lastResult
    ) {
        drawChart(
            lastX,
            lastY,
            lastResult
        );
    }
}

);

/* ============================================================
GLOBAL FUNCTIONS
============================================================ */

window.calculate4PL =
calculate4PL;

window.clearCalculator =
clearCalculator;

window.copyParametersText =
copyParametersText;

window.copySectionText =
copySectionText;

window.copyPredictionsText =
copyPredictionsText;

window.updatePredictions =
updatePredictions;