export function solveMatrix(A, b) {
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

export function getWeight(x, y, mode) {
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