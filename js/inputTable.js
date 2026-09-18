import { escapeHtml } from "./utils.js";

export function getInputBody() {
    return document.getElementById("dataTableBody");
}

export function initInputTable(rows = 8) {
    const tbody = getInputBody();
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let i = 0; i < rows; i++) {
        addInputRow();
    }
    updateInputCount();
}

export function updateInputCount() {
    const tbody = getInputBody();
    const count = document.getElementById("dataCount");
    if (!tbody || !count) return;
    let valid = 0;
    for (const row of tbody.rows) {
        const x = row.querySelector(".cell-x")?.value.trim();
        const y = row.querySelector(".cell-y")?.value.trim();
        if (x !== "" && y !== "" && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
            valid++;
        }
    }
    count.textContent = `${valid} data point${valid === 1 ? "" : "s"}`;
}

export function addInputRow(x = "", y = "") {
    const tbody = getInputBody();
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

export function ensureInputRow() {
    const tbody = getInputBody();
    if (!tbody || !tbody.lastElementChild) return;
    const last = tbody.lastElementChild;
    const x = last.querySelector(".cell-x")?.value.trim();
    const y = last.querySelector(".cell-y")?.value.trim();
    if (x !== "" || y !== "") {
        addInputRow();
    }
}

export function getInputData() {
    const tbody = getInputBody();
    if (!tbody) throw new Error("Input table not found.");
    const x = [];
    const y = [];
    for (const row of tbody.rows) {
        const xText = row.querySelector(".cell-x")?.value.trim();
        const yText = row.querySelector(".cell-y")?.value.trim();
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

export function handleInputPaste(event) {
    const text = event.clipboardData?.getData("text");
    if (!text) return;
    event.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
    const rows = lines.map(line => line.includes("\t") ? line.split("\t") : line.includes(",") ? line.split(",") : [line]);
    if (!rows.length) return;

    if (rows.length > 1 && (!Number.isFinite(Number(rows[0][0])) || !Number.isFinite(Number(rows[0][1])))) {
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