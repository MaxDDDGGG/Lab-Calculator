import { escapeHtml, formatNumber } from "./utils.js";
import { modelName } from "./models.js";

export function getPredictBody() {
    return document.getElementById("predictTableBody");
}

export function addPredictionRow(y = "") {
    const tbody = getPredictBody();
    if (!tbody) return;

    const row = tbody.rows.length + 1;
    const tr = document.createElement("tr");

    tr.innerHTML = `
        <td class="row-number">${row}</td>
        <td class="cell">
            <input class="cell-input cell-predict-y" type="text" value="${escapeHtml(y)}">
        </td>
        <td class="cell cell-predict-x"></td>
    `;
    tbody.appendChild(tr);
}

export function initPredictionTable(rows = 8) {
    const tbody = getPredictBody();
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let i = 0; i < rows; i++) {
        addPredictionRow();
    }
    updatePredictionCount();
}

export function ensurePredictionRow() {
    const tbody = getPredictBody();
    if (!tbody || !tbody.lastElementChild) return;
    const last = tbody.lastElementChild;
    const y = last.querySelector(".cell-predict-y")?.value.trim();
    if (y !== "") {
        addPredictionRow();
    }
}

export function updatePredictionCount() {
    const tbody = getPredictBody();
    const count = document.getElementById("predictCount");
    if (!tbody || !count) return;
    let n = 0;
    for (const row of tbody.rows) {
        const y = row.querySelector(".cell-predict-y")?.value.trim();
        if (y !== "") n++;
    }
    count.textContent = `${n} prediction${n === 1 ? "" : "s"}`;
}

export function updatePredictions(result, lastResult) {
    const tbody = getPredictBody();
    const activeResult = result !== undefined ? result : lastResult;
    if (!tbody) return;

    for (const row of tbody.rows) {
        const yText = row.querySelector(".cell-predict-y")?.value.trim();
        const output = row.querySelector(".cell-predict-x");
        if (!output) continue;
        if (!yText) {
            output.textContent = "";
            continue;
        }
        const y = Number(yText);
        if (!Number.isFinite(y) || !activeResult || typeof activeResult.inverse !== "function") {
            output.textContent = "N/A";
            continue;
        }
        const x = activeResult.inverse(y);
        output.textContent = Number.isFinite(x) ? formatNumber(x) : "N/A";
    }
}

export function handlePredictionPaste(event, callback) {
    const text = event.clipboardData?.getData("text");
    if (!text) return;
    event.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
    let rows = lines.map(line => line.includes("\t") ? line.split("\t") : line.includes(",") ? line.split(",") : [line]);
    
    if (!rows.length) return;
    if (!Number.isFinite(Number(rows[0][0]))) {
        rows.shift();
    }
    
    const tbody = getPredictBody();
    if (!tbody) return;
    tbody.innerHTML = "";
    
    for (const row of rows) {
        const y = row[0].trim(); 
        if (y !== "") addPredictionRow(y);
    }
    
    while (tbody.rows.length < 8) {
        addPredictionRow();
    }
    updatePredictionCount();
    if (typeof callback === "function") callback();
}

export async function copyPredictions() {
    const tbody = getPredictBody();
    if (!tbody) return;
    const lines = [["Y", "Predicted X"].join("\t")];
    for (const row of tbody.rows) {
        const y = row.querySelector(".cell-predict-y")?.value.trim();
        const x = row.querySelector(".cell-predict-x")?.textContent.trim();
        if (!y) continue;
        lines.push([y, x || ""].join("\t"));
    }
    try {
        await navigator.clipboard.writeText(lines.join("\n"));
        const button = document.getElementById("copyPredictionButton");
        if (button) {
            const original = button.textContent;
            button.textContent = "Copied";
            setTimeout(() => { button.textContent = original; }, 1200);
        }
    } catch (error) {
        console.error("Copy failed:", error);
    }
}