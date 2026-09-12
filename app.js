function fourPL(x, A, B, C, D) {
    return D + (A - D) / (1 + Math.pow(x / C, B));
}
function calculate4PL() {
    const x = document.getElementById("xValues").value
        .split(",")
        .map(Number)
        .filter(v => Number.isFinite(v) && v > 0);
    const y = document.getElementById("yValues").value
        .split(",")
        .map(Number)
        .filter(v => Number.isFinite(v));
    if (x.length !== y.length || x.length < 4) {
        alert("Please enter at least 4 matching X and Y values.");
        return;
    }
    // Initial parameter estimates
    let A = Math.max(...y);
    let D = Math.min(...y);
    let C = x[Math.floor(x.length / 2)];
    let B = 1;
    // Simple grid-search fitting
    let bestError = Infinity;
    let best = null;
    for (let b = -5; b <= 5; b += 0.1) {
        for (let c = Math.min(...x); c <= Math.max(...x); c *= 1.05) {
            const predictions = x.map(v => fourPL(v, A, b, c, D));
            const error = predictions.reduce(
                (sum, prediction, i) =>
                    sum + Math.pow(prediction - y[i], 2),
                0
            );
            if (error < bestError) {
                bestError = error;
                best = {
                    A: A,
                    B: b,
                    C: c,
                    D: D
                };
            }
        }
    }
    A = best.A;
    B = best.B;
    C = best.C;
    D = best.D;
    document.getElementById("parameters").innerHTML = `
        <strong>A:</strong> ${A.toFixed(5)}<br>
        <strong>B:</strong> ${B.toFixed(5)}<br>
        <strong>C:</strong> ${C.toFixed(5)}<br>
        <strong>D:</strong> ${D.toFixed(5)}<br>
        <strong>SSE:</strong> ${bestError.toFixed(5)}
    `;
    document.getElementById("results").classList.remove("hidden");
}