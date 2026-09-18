import { formatNumber } from "./utils.js";
import { solveMatrix, getWeight } from "./math.js";

function fitLinear(x, y, weighting) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
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
        predict: xv => m * xv + c,
        inverse: yValue => Math.abs(m) < 1e-12 ? null : (yValue - c) / m,
        equation: `y = ${formatNumber(m)}x + ${formatNumber(c)}`
    };
}

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
    
    let inverse = null;
    if (degree === 2) {
        const c_coef = p[0], b_coef = p[1], a_coef = p[2];
        inverse = yValue => {
            const discriminant = b_coef * b_coef - 4 * a_coef * (c_coef - yValue);
            if (discriminant < 0 || Math.abs(a_coef) < 1e-12) return null;
            return (-b_coef + Math.sqrt(discriminant)) / (2 * a_coef);
        };
    }

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
        inverse,
        equation
    };
}

function fourPL(x, A, B, C, D) {
    return D + (A - D) / (1 + Math.pow(x / C, B));
}

function fit4PL(x, y, weighting, constrained) {
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    let A = minY, D = maxY, B = 1, C = (minX + maxX) / 2;
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
        A += (Math.random() - 0.5) * (maxY - minY) * 0.01;
        D += (Math.random() - 0.5) * (maxY - minY) * 0.01;
        B += (Math.random() - 0.5) * 0.02;
        C += (Math.random() - 0.5) * Math.max((maxX - minX) * 0.01, 0.0001);
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
            A = old.A; B = old.B; C = old.C; D = old.D;
        }
    }
    
    return {
        type: "4pl",
        constrained,
        params: { A, B, C, D },
        predict: xv => fourPL(xv, A, B, C, D),
        inverse: yValue => {
            const low = Math.min(A, D), high = Math.max(A, D);
            if (yValue <= low || yValue >= high) return null;
            const denominator = yValue - D;
            if (Math.abs(denominator) < 1e-12) return null;
            const base = (A - yValue) / denominator; 
            if (base <= 0) return null;
            return C * Math.pow(base, 1 / B);
        },
        equation: `4PL model`
    };
}

function fivePL(x, A, B, C, D, G) {
    return D + (A - D) / Math.pow(1 + Math.pow(x / C, B), G);
}

function fit5PL(x, y, weighting) {
    const minY = Math.min(...y), maxY = Math.max(...y);
    let A = minY, D = maxY, B = 1, C = (Math.min(...x) + Math.max(...x)) / 2, G = 1;
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
            A = old.A; B = old.B; C = old.C; D = old.D; G = old.G;
        }
    }
    return {
        type: "5pl",
        params: { A, B, C, D, asymmetry: G },
        predict: xv => fivePL(xv, A, B, C, D, G),
        inverse: yValue => {
            if (yValue <= Math.min(A, D) || yValue >= Math.max(A, D)) return null;
            const ratio = (A - D) / (yValue - D);
            if (ratio <= 0 || G <= 0 || B <= 0 || C <= 0) return null;
            const inner = Math.pow(ratio, 1 / G) - 1;
            if (inner <= 0) return null;
            return C * Math.pow(inner, 1 / B);
        },
        equation: "5PL model"
    };
}

function fitMichaelisMenten(x, y, weighting) {
    let vmax = Math.max(...y), km = Math.max(...x) / 2;
    for (let iteration = 0; iteration < 2000; iteration++) {
        let gradV = 0, gradK = 0;
        for (let i = 0; i < x.length; i++) {
            const denominator = km + x[i];
            if (denominator <= 0) continue;
            const prediction = vmax * x[i] / denominator;
            const error = prediction - y[i];
            const w = getWeight(x[i], y[i], weighting);
            gradV += 2 * w * error * x[i] / denominator;
            gradK += 2 * w * error * (-vmax * x[i]) / (denominator * denominator);
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
        inverse: yValue => (yValue < 0 || yValue >= vmax) ? null : yValue * km / (vmax - yValue),
        equation: `y = ${formatNumber(vmax)}x / (${formatNumber(km)} + x)`
    };
}

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
            inverse: yValue => yValue > 0 ? Math.log(yValue / A) / k : null,
            equation: `y = ${formatNumber(A)}e^(${formatNumber(k)}x)`
        };
    }
    const A = Math.exp(linear.params.c);
    const k = -linear.params.m;
    return {
        type: "expDecay",
        params: { A, k, offset: 0 },
        predict: xv => A * Math.exp(-k * xv),
        inverse: yValue => (yValue > 0 && A > 0 && k !== 0) ? -Math.log(yValue / A) / k : null,
        equation: `y = ${formatNumber(A)}e^(-${formatNumber(k)}x)`
    };
}

function fitGaussian(x, y) {
    let amplitude = Math.max(...y);
    let mean = x[y.indexOf(amplitude)];
    let sd = Math.max((Math.max(...x) - Math.min(...x)) / 4, 0.001);
    return {
        type: "gaussian",
        params: { amplitude, mean, sd },
        predict: xv => amplitude * Math.exp(-Math.pow(xv - mean, 2) / (2 * sd * sd)),
        inverse: () => null,
        equation: `y = ${formatNumber(amplitude)} exp(-(x-${formatNumber(mean)})² / (2 × ${formatNumber(sd)}²))`
    };
}

export function fitModel(model, x, y, weighting) {
    switch (model) {
        case "4pl_unconstrained": return fit4PL(x, y, weighting, false);
        case "4pl_constrained": return fit4PL(x, y, weighting, true);
        case "5pl": return fit5PL(x, y, weighting);
        case "linear": return fitLinear(x, y, weighting);
        case "quadratic": return fitPolynomial(x, y, 2, weighting);
        case "cubic": return fitPolynomial(x, y, 3, weighting);
        case "michaelisMenten": return fitMichaelisMenten(x, y, weighting);
        case "expGrowth": return fitExponential(x, y, false);
        case "expDecay": return fitExponential(x, y, true);
        case "gaussian": return fitGaussian(x, y);
        default: throw new Error("Unknown fit model.");
    }
}

export function modelName(result) {
    if (!result) return "";
    if (result.type === "4pl") {
        return result.constrained ? "4PL (Constrained)" : "4PL (Unconstrained)";
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

export function calculateFitStats(x, y, result) {
    const predictions = x.map(result.predict);
    const n = x.length;
    let p = 2;
    if (result.params) {
        if (result.params.coefficients) {
            p = result.params.coefficients.length;
        } else {
            p = Object.keys(result.params).filter(k => typeof result.params[k] === "number").length;
        }
    }

    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        ssTot += Math.pow(y[i] - meanY, 2);
        ssRes += Math.pow(y[i] - predictions[i], 2);
    }

    const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    const dof = Math.max(1, n - p);
    const aR2 = n > p ? 1 - ((1 - r2) * (n - 1)) / (n - p) : r2;
    const rmse = Math.sqrt(ssRes / n);
    const se = Math.sqrt(ssRes / dof);
    
    const ssReg = Math.max(0, ssTot - ssRes);
    const msReg = ssReg / Math.max(1, p - 1);
    const msRes = ssRes / dof;
    const fStat = msRes === 0 ? 0 : msReg / msRes;
    const pVal = fStat > 1 ? Math.max(0.0001, 1 / (1 + fStat * 0.1)) : 1.0;

    const sseSafe = Math.max(ssRes, 1e-15);
    const aic = n * Math.log(sseSafe / n) + 2 * p;
    const bic = n * Math.log(sseSafe / n) + p * Math.log(n);

    return { n, r2, aR2, pVal, se, sse: ssRes, fStat, aic, bic, dof, rmse };
}