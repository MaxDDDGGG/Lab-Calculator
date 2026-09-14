let lastX = null, lastY = null, lastResult = null;

// Initialize editable table rows
function initSpreadsheet(rowCount = 8) {
	const tbody = document.getElementById("dataTableBody");
	if (!tbody) return;
	tbody.innerHTML = "";
	for (let i = 0; i < rowCount; i++) {
		addSpreadsheetRow(tbody, i + 1);
	}
	updateDataCount();
}

function addSpreadsheetRow(tbody, rowNum, xVal = "", yVal = "") {
	const tr = document.createElement("tr");
	tr.innerHTML = `
		<td class="row-number">${rowNum}</td>
		<td contenteditable="true" class="cell cell-x">${xVal}</td>
		<td contenteditable="true" class="cell cell-y">${yVal}</td>
	`;
	tbody.appendChild(tr);
}

// Extract numeric data from editable table cells
function parseSpreadsheetTable() {
	const rows = document.querySelectorAll("#dataTableBody tr");
	const xValues = [], yValues = [];

	rows.forEach((tr, index) => {
		const xText = tr.querySelector(".cell-x")?.textContent.trim();
		const yText = tr.querySelector(".cell-y")?.textContent.trim();

		if (!xText && !yText) return;

		const x = Number(xText);
		const y = Number(yText);

		// Skip header rows if present
		if (index === 0 && !Number.isFinite(x) && !Number.isFinite(y)) return;

		if (!Number.isFinite(x)) throw new Error(`Invalid concentration on row ${index + 1}: "${xText}".`);
		if (!Number.isFinite(y)) throw new Error(`Invalid response on row ${index + 1}: "${yText}".`);

		xValues.push(x);
		yValues.push(y);
	});

	if (xValues.length < 4) throw new Error("At least four valid data pairs are required.");
	return { xValues, yValues };
}

// Calculate weighting factors
function getWeights(xValues, yValues, strategy) {
	return yValues.map((y, i) => {
		const x = xValues[i];
		switch (strategy) {
			case "invY": return y !== 0 ? 1 / Math.abs(y) : 1;
			case "invY2": return y !== 0 ? 1 / (y * y) : 1;
			case "invX2": return x !== 0 ? 1 / (x * x) : 1;
			default: return 1;
		}
	});
}

// Linear fitting fallback
function fitLinear(xValues, yValues, weights) {
	let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
	for (let i = 0; i < xValues.length; i++) {
		const x = xValues[i], y = yValues[i], w = weights[i];
		sw += w; swx += w * x; swy += w * y;
		swxx += w * x * x; swxy += w * x * y;
	}
	const denom = sw * swxx - swx * swx;
	const m = (sw * swxy - swx * swy) / denom;
	const c = (swy * swxx - swx * swxy) / denom;
	return { type: "linear", params: { slope: m, intercept: c }, predict: (x) => m * x + c };
}

// Main calculation entry point
function calculate4PL() {
	try {
		clearError();
		const { xValues, yValues } = parseSpreadsheetTable();
		const modelType = document.getElementById("fitModel")?.value || "4pl";
		const weightType = document.getElementById("weighting")?.value || "none";
		const weights = getWeights(xValues, yValues, weightType);

		let result;
		if (modelType === "linear") {
			result = fitLinear(xValues, yValues, weights);
		} else {
			result = typeof fit4PL === "function" ? fit4PL(xValues, yValues, weights) : fitLinear(xValues, yValues, weights);
		}

		lastX = xValues;
		lastY = yValues;
		lastResult = result;

		if (typeof displayResults === "function") {
			displayResults(result, xValues, yValues);
		}
		console.log("Fit result:", result);
	} catch (error) {
		console.error("Calculation error:", error);
		showError(error.message);
	}
}

function updateDataCount() {
	const countEl = document.getElementById("dataCount");
	if (!countEl) return;
	try {
		const { xValues } = parseSpreadsheetTable();
		countEl.textContent = `${xValues.length} data point${xValues.length === 1 ? "" : "s"}`;
	} catch {
		countEl.textContent = "0 data points";
	}
}

function showError(message) {
	let errorBox = document.getElementById("errorMessage");
	if (!errorBox) {
		errorBox = document.createElement("div");
		errorBox.id = "errorMessage";
		errorBox.className = "error-message";
		const inputCard = document.querySelector(".card");
		if (inputCard) inputCard.appendChild(errorBox);
		else document.body.appendChild(errorBox);
	}
	errorBox.textContent = message;
	errorBox.classList.add("visible");
}

function clearError() {
	const errorBox = document.getElementById("errorMessage");
	if (errorBox) {
		errorBox.textContent = "";
		errorBox.classList.remove("visible");
	}
	const inputError = document.getElementById("inputError");
	if (inputError) {
		inputError.textContent = "";
		inputError.classList.add("hidden");
	}
}

function clearCalculator() {
	initSpreadsheet(8);
	const results = document.getElementById("results");
	if (results) results.classList.add("hidden");
	clearError();
	lastX = null;
	lastY = null;
	lastResult = null;
}

function loadExample() {
	const exampleData = [
		[0.1, 0.12], [0.5, 0.25], [1, 0.48],
		[5, 0.72], [10, 0.86], [50, 0.95]
	];
	const tbody = document.getElementById("dataTableBody");
	if (!tbody) return;
	tbody.innerHTML = "";
	exampleData.forEach((pair, idx) => {
		addSpreadsheetRow(tbody, idx + 1, pair[0], pair[1]);
	});
	updateDataCount();
	clearError();
	calculate4PL();
}

// Clipboard Paste & Keyboard Listener for Spreadsheet Table
document.addEventListener("DOMContentLoaded", () => {
	initSpreadsheet(8);

	const table = document.getElementById("dataTable");
	if (table) {
		// Handle Excel / TSV / CSV Clipboard Paste directly into table cells
		table.addEventListener("paste", (e) => {
			e.preventDefault();
			const clipboardData = (e.clipboardData || window.clipboardData).getData("text");
			if (!clipboardData) return;

			const rows = clipboardData.trim().split(/\r?\n/);
			const targetCell = e.target.closest("td");
			const tbody = document.getElementById("dataTableBody");

			let startRowIdx = targetCell ? targetCell.parentElement.rowIndex - 1 : 0;
			if (startRowIdx < 0) startRowIdx = 0;

			rows.forEach((rowText, rIdx) => {
				const cols = rowText.split(/\t|,/);
				const xVal = cols[0] ? cols[0].trim() : "";
				const yVal = cols[1] ? cols[cols.length > 1 ? 1 : 0].trim() : "";

				if (rIdx === 0 && isNaN(Number(xVal)) && isNaN(Number(yVal))) return;

				let targetRow = tbody.children[startRowIdx + rIdx];
				if (!targetRow) {
					addSpreadsheetRow(tbody, tbody.children.length + 1, xVal, yVal);
				} else {
					targetRow.querySelector(".cell-x").textContent = xVal;
					targetRow.querySelector(".cell-y").textContent = yVal;
				}
			});

			updateDataCount();
		});

		table.addEventListener("input", updateDataCount);
	}

	const calculateButton = document.getElementById("calculateButton");
	const exampleButton = document.getElementById("exampleButton");
	const clearButton = document.getElementById("clearButton");

	if (calculateButton) calculateButton.addEventListener("click", calculate4PL);
	if (exampleButton) exampleButton.addEventListener("click", loadExample);
	if (clearButton) clearButton.addEventListener("click", clearCalculator);
});

window.addEventListener("resize", () => {
	if (lastX && lastY && lastResult && typeof drawChart === "function") {
		drawChart(lastX, lastY, lastResult);
	}
});

window.calculate4PL = calculate4PL;
window.loadExample = loadExample;
window.clearCalculator = clearCalculator;

console.log("4PL Laboratory Calculator loaded.");