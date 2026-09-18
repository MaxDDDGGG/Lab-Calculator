import { showError, clearError } from "./utils.js";
import { fitModel } from "./models.js";
import { initInputTable, updateInputCount, ensureInputRow, getInputData, handleInputPaste } from "./inputTable.js";
import { initPredictionTable, updatePredictionCount, ensurePredictionRow, handlePredictionPaste, updatePredictions, copyPredictions } from "./predictionTable.js";
import { displayResults, clearResults } from "./results.js";

let lastX = [];
let lastY = [];
let lastResult = null;

function calculateFit() {
    clearError();
    try {
        const data = getInputData();
        const model = document.getElementById("fitModel")?.value || "4pl_unconstrained";
        const weighting = document.getElementById("weighting")?.value || "none";

        lastX = data.x;
        lastY = data.y;

        const result = fitModel(model, data.x, data.y, weighting);
        lastResult = result;
        displayResults(lastX, lastY, result);

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        showError(err.message);
        clearResults();
        lastResult = null;
        updatePredictions(null);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initInputTable(8);
    initPredictionTable(8);

    document.getElementById("copyPredictionButton")?.addEventListener("click", copyPredictions);
    document.getElementById("calculateButton")?.addEventListener("click", calculateFit);
    document.getElementById("fitModel")?.addEventListener("change", calculateFit);
    document.getElementById("weighting")?.addEventListener("change", calculateFit);

    // Helper function for copy feedback
    const triggerCopyFeedback = (btn) => {
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("copied");
        setTimeout(() => { 
            btn.textContent = originalText; 
            btn.classList.remove("copied");
        }, 1200);
    };

    // Copy Equation listener
    document.getElementById("copyEquationButton")?.addEventListener("click", async () => {
        const eqEl = document.getElementById("equationDisplay");
        if (!eqEl) return;
        try {
            await navigator.clipboard.writeText(eqEl.textContent.trim());
            triggerCopyFeedback(document.getElementById("copyEquationButton"));
        } catch (err) {
            console.error("Copy failed:", err);
        }
    });

    // Copy Parameters listener
    document.getElementById("copyParametersButton")?.addEventListener("click", async () => {
        const paramEl = document.getElementById("parameters");
        if (!paramEl) return;
        try {
            await navigator.clipboard.writeText(paramEl.textContent.trim());
            triggerCopyFeedback(document.getElementById("copyParametersButton"));
        } catch (err) {
            console.error("Copy failed:", err);
        }
    });

    // Copy Stats listener (for grid/table elements)
    document.getElementById("copyStatsButton")?.addEventListener("click", async () => {
        const statsEl = document.getElementById("fitStatsGrid");
        if (!statsEl) return;
        try {
            // Extract text neatly from grid children if it has multiple items
            const items = statsEl.querySelectorAll('div, span');
            let textToCopy = "";
            if (items.length > 0) {
                let lines = [];
                items.forEach(el => {
                    if (el.innerText.trim()) lines.push(el.innerText.trim());
                });
                textToCopy = lines.join('\n');
            } else {
                textToCopy = statsEl.textContent.trim();
            }

            await navigator.clipboard.writeText(textToCopy);
            triggerCopyFeedback(document.getElementById("copyStatsButton"));
        } catch (err) {
            console.error("Copy failed:", err);
        }
    });
});

    const dataTable = document.getElementById("dataTable");
    if (dataTable) {
        dataTable.addEventListener("paste", handleInputPaste);
        dataTable.addEventListener("input", () => {
            updateInputCount();
            ensureInputRow();
        });
    }

    const predictTable = document.getElementById("predictTable");
    if (predictTable) {
        predictTable.addEventListener("paste", (e) => handlePredictionPaste(e, () => updatePredictions(lastResult)));
        predictTable.addEventListener("input", () => {
            updatePredictionCount();
            ensurePredictionRow();
            updatePredictions(lastResult);
        });
    }
});