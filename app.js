let lastX = null, lastY = null, lastResult = null;

function parseInputData() {
	const inputElement = document.getElementById("dataInput");
	if (!inputElement) throw new Error("Data input field could not be found.");

	const input = inputElement.value.trim();
	if (!input) throw new Error("Please paste your concentration and response data.");

	const xValues = [], yValues = [];
	const rows = input.split(/\r?\n/);

	rows.forEach((row, index) => {
		const trimmedRow = row.trim();
		if (!trimmedRow) return;

		const columns = row.includes("\t") ? row.split("\t") : row.split(",");
		if (columns.length < 2) throw new Error(`Row ${index + 1} does not contain two columns.`);

		const xText = columns[0].trim();
		const yText = columns[1].trim();

		if (!xText && !yText) return;

		const x = Number(xText);
		const y = Number(yText);

		if (index === 0 && !Number.isFinite(x) && !Number.isFinite(y)) return;

		if (!Number.isFinite(x)) throw new Error(`Invalid concentration on row ${index + 1}: "${xText}".`);
		if (!Number.isFinite(y)) throw new Error(`Invalid response on row ${index + 1}: "${yText}".`);

		xValues.push(x);
		yValues.push(y);
	});

	if (xValues.length < 4) throw new Error("At least four valid concentration/response pairs are required.");

	return { xValues, yValues };
}

function updateDataPreview() {
	const preview = document.getElementById("dataPreview");
	const tbody = document.getElementById("dataPreviewBody");
	const count = document.getElementById("dataCount");
	const error = document.getElementById("inputError");
	const inputElement = document.getElementById("dataInput");

	if (!preview || !tbody || !count || !error) return;

	tbody.innerHTML = "";
	error.textContent = "";
	error.classList.add("hidden");

	if (!inputElement || !inputElement.value.trim()) {
		preview.classList.add("hidden");
		return;
	}

	try {
		const { xValues, yValues } = parseInputData();

		xValues.forEach((x, i) => {
			const row = document.createElement("tr");
			const xCell = document.createElement("td");
			const yCell = document.createElement("td");

			xCell.textContent = formatNumber(x);
			yCell.textContent = formatNumber(yValues[i]);

			row.appendChild(xCell);
			row.appendChild(yCell);
			tbody.appendChild(row);
		});

		count.textContent = `${xValues.length} data point${xValues.length === 1 ? "" : "s"}`;
		preview.classList.remove("hidden");
	} catch (errorObject) {
		preview.classList.add("hidden");
		error.textContent = errorObject.message;
		error.classList.remove("hidden");
	}
}

function calculate4PL() {
	try {
		clearError();
		const { xValues, yValues } = parseInputData();
		const result = fit4PL(xValues, yValues);

		lastX = xValues;
		lastY = yValues;
		lastResult = result;

		displayResults(result, xValues, yValues);
		console.log("4PL fit:", result);
	} catch (error) {
		console.error("4PL calculation error:", error);
		showError(error.message);
	}
}

function showError(message) {
	let errorBox = document.getElementById("errorMessage");

	if (!errorBox) {
		errorBox = document.createElement("div");
		errorBox.id = "errorMessage";
		errorBox.className = "error-message";

		const inputCard = document.querySelector(".card");
		if (inputCard) {
			inputCard.appendChild(errorBox);
		} else {
			document.body.appendChild(errorBox);
		}
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
	const dataInput = document.getElementById("dataInput");
	const results = document.getElementById("results");
	const preview = document.getElementById("dataPreview");
	const tbody = document.getElementById("dataPreviewBody");

	if (dataInput) dataInput.value = "";
	if (results) results.classList.add("hidden");
	if (preview) preview.classList.add("hidden");
	if (tbody) tbody.innerHTML = "";

	clearError();
	lastX = null;
	lastY = null;
	lastResult = null;
}

function loadExample() {
	const dataInput = document.getElementById("dataInput");
	if (!dataInput) return;

	dataInput.value = `Concentration (X)\tResponse (Y)\n0.1\t0.12\n0.5\t0.25\n1\t0.48\n5\t0.72\n10\t0.86\n50\t0.95`;

	updateDataPreview();
	clearError();
	calculate4PL();
}

window.addEventListener("resize", () => {
	if (lastX && lastY && lastResult) {
		drawChart(lastX, lastY, lastResult);
	}
});

document.addEventListener("DOMContentLoaded", () => {
	const dataInput = document.getElementById("dataInput");
	const calculateButton = document.getElementById("calculateButton");
	const exampleButton = document.getElementById("exampleButton");
	const clearButton = document.getElementById("clearButton");

	if (dataInput) dataInput.addEventListener("input", updateDataPreview);
	if (calculateButton) calculateButton.addEventListener("click", calculate4PL);
	if (exampleButton) exampleButton.addEventListener("click", loadExample);
	if (clearButton) clearButton.addEventListener("click", clearCalculator);
});

window.calculate4PL = calculate4PL;
window.loadExample = loadExample;
window.clearCalculator = clearCalculator;

console.log("4PL Laboratory Calculator loaded.");