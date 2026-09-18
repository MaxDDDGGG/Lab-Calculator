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
    console.log("🚀 calculateFit() triggered");
    
    try {
        const data = getInputData();
        console.log("📊 Raw input data retrieved:", data);

        if (!data || !data.x || !data.y || data.x.length === 0 || data.y.length === 0) {
            throw new Error("Please enter valid X and Y data points in the table.");
        }

        const selectedModel = document.getElementById("fitModel")?.value || "4pl_unconstrained";
        const weighting = document.getElementById("weighting")?.value || "none";
        console.log(`🔍 Selected Model: ${selectedModel}, Weighting: ${weighting}`);

        lastX = data.x;
        lastY = data.y;

        let result = null;

        if (selectedModel === "best_fit") {
            const candidateModels = [
                "4pl_unconstrained", "4pl_constrained", "5pl", 
                "linear", "quadratic", "cubic", 
                "michaelisMenten", "expGrowth", "expDecay", "gaussian"
            ];
            
            let bestScore = -Infinity;
            let bestResult = null;
            let bestModelName = "";

            candidateModels.forEach(m => {
                try {
                    const res = fitModel(m, data.x, data.y, weighting);
                    if (res) {
                        console.log(`Model ${m} succeeded. Stats object:`, res.stats);
                        const stats = res.stats || {};
                        
                        const score = stats.rSquared ?? stats.R2 ?? stats.r2 ?? stats.rsquared ?? stats.adjR2 ?? 0;
                        
                        if (typeof score === "number" && !isNaN(score) && score > bestScore) {
                            bestScore = score;
                            bestResult = res;
                            bestModelName = m;
                        } else if (!bestResult) {
                            bestResult = res;
                            bestModelName = m;
                        }
                    }
                } catch (e) {
                    console.log(`Model ${m} failed:`, e.message);
                }
            });

            if (!bestResult) {
                throw new Error("Could not find a valid converging model for this dataset.");
            }
            
            console.log(`✨ Best fit automatically selected: ${bestModelName} (Score: ${bestScore})`);
            result = bestResult;

        } else if (selectedModel === "custom") {
            const expression = document.getElementById("customExpression")?.value.trim();
            if (!expression) throw new Error("Please enter a custom mathematical expression.");
            result = fitModel("custom", data.x, data.y, weighting, { expression });

        } else {
            result = fitModel(selectedModel, data.x, data.y, weighting);
        }

        if (!result || typeof result.predict !== "function") {
            throw new Error("The selected model did not return a valid prediction function.");
        }

        lastResult = result;
        console.log("📈 Displaying results...");
        
        displayResults(lastX, lastY, result);
        updatePredictions(lastResult);

        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
        console.error("❌ calculateFit error caught:", err.message);
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
            const items = paramEl.querySelectorAll('li'); 
            let lines = [];
            
            if (items.length > 0) {
                items.forEach(li => {
                    const strongTag = li.querySelector('strong');
                    if (strongTag) {
                        const label = strongTag.textContent.replace(/:$/, '').trim();
                        let fullText = li.textContent.replace(/\s+/g, ' ').trim();
                        let val = fullText.replace(strongTag.textContent, '').replace(/^[:\s]+/, '').trim();
                        
                        const pair = `${label}\t${val}`;
                        if (!lines.includes(pair)) {
                            lines.push(pair);
                        }
                    }
                });
            } else {
                lines.push(paramEl.textContent.replace(/\s+/g, ' ').trim());
            }

            const textToCopy = lines.join('\n');
            await navigator.clipboard.writeText(textToCopy);
            triggerCopyFeedback(document.getElementById("copyParametersButton"));
        } catch (err) {
            console.error("Copy failed:", err);
        }
    });

    // Copy Stats listener
    document.getElementById("copyStatsButton")?.addEventListener("click", async () => {
        const statsEl = document.getElementById("fitStatsGrid");
        if (!statsEl) return;
        try {
            const items = statsEl.querySelectorAll('li'); 
            let lines = [];
            
            if (items.length > 0) {
                items.forEach(li => {
                    const strongTag = li.querySelector('strong');
                    if (strongTag) {
                        const label = strongTag.textContent.replace(/:$/, '').trim();
                        let fullText = li.textContent.replace(/\s+/g, ' ').trim();
                        let val = fullText.replace(strongTag.textContent, '').replace(/^[:\s]+/, '').trim();
                        
                        const pair = `${label}\t${val}`;
                        if (!lines.includes(pair)) {
                            lines.push(pair);
                        }
                    }
                });
            }

            const textToCopy = lines.join('\n');
            await navigator.clipboard.writeText(textToCopy);
            triggerCopyFeedback(document.getElementById("copyStatsButton"));
        } catch (err) {
            console.error("Copy failed:", err);
        }
    });

// Custom Model Visibility Toggle
    const fitModelSelect = document.getElementById("fitModel");
    const customWrapper = document.getElementById("customModelWrapper");
    const customExpressionInput = document.getElementById("customExpression");

    fitModelSelect?.addEventListener("change", (e) => {
        if (e.target.value === "custom") {
            customWrapper?.classList.remove("hidden");
            // Don't auto-calculate immediately when opening custom, wait for input
        } else {
            customWrapper?.classList.add("hidden");
            calculateFit(); // Safe to calculate for standard options or best fit
        }
    });

    customExpressionInput?.addEventListener("input", () => {
        if (fitModelSelect.value === "custom") {
            calculateFit();
        }
    });


    // Table Event Listeners
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

    document.getElementById("clearInputTable")?.addEventListener("click", () => {
        clearInputTable();
    });

    document.getElementById("clearPredictionTable")?.addEventListener("click", () => {
        clearPredictionTable();
    });
});

// Clear the input data table helper
function clearInputTable() {
    const dataTable = document.getElementById("dataTable");
    if (!dataTable) return;
    
    const inputs = dataTable.querySelectorAll("input");
    inputs.forEach(input => input.value = "");
    
    if (typeof initInputTable === "function") {
        initInputTable(8);
    }
}

// Clear the prediction table helper
function clearPredictionTable() {
    const predictTable = document.getElementById("predictTable");
    if (!predictTable) return;
    
    const inputs = predictTable.querySelectorAll("input");
    inputs.forEach(input => input.value = "");
    
    const results = predictTable.querySelectorAll(".prediction-result, span.result-cell"); 
    results.forEach(el => el.textContent = "");
    
    if (typeof initPredictionTable === "function") {
        initPredictionTable(8);
    }
}