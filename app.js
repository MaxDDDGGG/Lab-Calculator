"use strict";
// ============================================================
// 4PL MODEL
// y = D + (A - D) / (1 + (x / C)^B)
// ============================================================
function fourPL(x, A, B, C, D) {
    return D + (A - D) / (1 + Math.pow(x / C, B));
}
// ============================================================
// READ NUMBERS FROM TEXT
// Accepts commas, spaces, tabs or new lines
// ============================================================
function parseNumbers(text) {
    return text
        .split(/[\s,;]+/)
        .map(Number)
        .filter(Number.isFinite);
}
// ============================================================
// SIMPLE 4PL FIT
// Uses a grid search over B and C, then calculates A and D.
// This is intentionally simple and robust for the first version.
// ============================================================
function fit4PL(x, y) {
    if (x.length !== y.length) {
        throw new Error("X and Y must contain the same number of values.");
    }
    if (x.length < 4) {
        throw new Error("Enter at least 4 standard points.");
    }
    if (x.some(v => v <= 0)) {
        throw new Error("All concentrations must be greater than 0.");
    }
    if (new Set(x).size < 4) {
        throw new Error("You need at least 4 different concentrations.");
    }
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    const rangeY = maxY - minY;
    if (rangeY === 0) {
        throw new Error("The response values cannot all be the same.");
    }
    let best = null;
    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    // Try a range of B values
    for (let B = -10; B <= 10; B += 0.25) {
        if (Math.abs(B) < 0.01) {
            continue;
        }
        // Try C values across the concentration range
        for (let i = 0; i <= 100; i++) {
            const fraction = i / 100;
            // logarithmic spacing
            const logC =
                Math.log(minX) +
                fraction * (Math.log(maxX) - Math.log(minX));
            const C = Math.exp(logC);
            // Estimate A and D from the observed response range
            let A;
            let D;
            if (B > 0) {
                A = maxY;
                D = minY;
            } else {
                A = minY;
                D = maxY;
            }
            let sse = 0;
            for (let j = 0; j < x.length; j++) {
                const predicted = fourPL(x[j], A, B, C, D);
                const residual = y[j] - predicted;
                sse += residual * residual;
            }
            if (!best || sse < best.sse) {
                best = {
                    A,
                    B,
                    C,
                    D,
                    sse
                };
            }
        }
    }
    if (!best) {
        throw new Error("Unable to fit the 4PL curve.");
    }
    // Calculate predictions
    const predictions = x.map(v =>
        fourPL(v, best.A, best.B, best.C, best.D)
    );
    // R²
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    let ssTotal = 0;
    let ssResidual = 0;
    for (let i = 0; i < y.length; i++) {
        ssTotal += Math.pow(y[i] - meanY, 2);
        ssResidual += Math.pow(y[i] - predictions[i], 2);
    }
    const r2 =
        ssTotal === 0
            ? 0
            : 1 - (ssResidual / ssTotal);
    const rmse =
        Math.sqrt(ssResidual / y.length);
    return {
        ...best,
        predictions,
        r2,
        rmse
    };
}
// ============================================================
// MAIN CALCULATION
// ============================================================
function calculate4PL() {
    try {
        const xText =
            document.getElementById("xValues").value;
        const yText =
            document.getElementById("yValues").value;
        const x = parseNumbers(xText);
        const y = parseNumbers(yText);
        if (x.length === 0) {
            throw new Error("Please enter concentration values.");
        }
        if (y.length === 0) {
            throw new Error("Please enter response values.");
        }
        const result = fit4PL(x, y);
        // Show results section
        const results =
            document.getElementById("results");
        results.classList.remove("hidden");
        // Display parameters
        const parameters =
            document.getElementById("parameters");
        parameters.innerHTML = `
            <h3>4PL Parameters</h3>
            <p><strong>A:</strong> ${result.A.toFixed(6)}</p>
            <p><strong>B:</strong> ${result.B.toFixed(6)}</p>
            <p><strong>C:</strong> ${result.C.toFixed(6)}</p>
            <p><strong>D:</strong> ${result.D.toFixed(6)}</p>
            <hr>
            <p><strong>R²:</strong> ${result.r2.toFixed(6)}</p>
            <p><strong>RMSE:</strong> ${result.rmse.toFixed(6)}</p>
            <hr>
            <p>
                <strong>Formula:</strong><br>
                y = D + (A - D) / (1 + (x / C)<sup>B</sup>)
            </p>
        `;
        console.log("4PL fit:", result);
    } catch (error) {
        console.error(error);
        alert("4PL calculation error:\n\n" + error.message);
    }
}
// ============================================================
// MAKE SURE THE FUNCTION IS AVAILABLE TO THE HTML BUTTON
// ============================================================
window.calculate4PL = calculate4PL;
console.log("4PL Calculator loaded successfully.");