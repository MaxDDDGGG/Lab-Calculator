import { formatNumber, escapeHtml } from "./utils.js";
import { modelName, calculateFitStats } from "./models.js";
import { updatePredictions } from "./predictionTable.js";

let fitChart = null;

export function displayResults(lastX, lastY, result) {
    const resultsCard = document.getElementById("resultsCard");
    const statisticsCard = document.getElementById("statisticsCard");
    const parameters = document.getElementById("parameters");
    const equationDisplay = document.getElementById("equationDisplay");
    const fitStatsGrid = document.getElementById("fitStatsGrid");
    const pointCount = document.getElementById("pointCount");
    
    // Unhide both cards so the curve and details become visible
    if (resultsCard) resultsCard.classList.remove("hidden");
    if (statisticsCard) statisticsCard.classList.remove("hidden");

    if (pointCount) {
        pointCount.textContent = `${lastX.length} Points Fitted`;
    }

    const stats = calculateFitStats(lastX, lastY, result);

// 1. Populate Compact Parameters
    if (parameters) {
        let paramHtml = `<div class="compact-param-list"><ul>`;
        for (const [key, value] of Object.entries(result.params)) {
            if (typeof value !== "number") continue;
            paramHtml += `<li><span><strong>${escapeHtml(key)}:</strong></span> ${formatNumber(value)}</li>`;
        }
        paramHtml += `</ul></div>`;
        parameters.innerHTML = paramHtml;
    }

    // 2. Populate Equation
    if (equationDisplay) {
        equationDisplay.textContent = result.equation || modelName(result);
    }

    // 3. Populate Grouped Goodness of Fit Stats (Fixed missing `</li>` tags)
    if (fitStatsGrid) {
        fitStatsGrid.innerHTML = `
            <div class="fit-stats-group" style="width: 100%;">
                <div class="stats-row">
                    <ul>
                        <li><span><strong>R²: </strong> </span> ${formatNumber(stats.r2)}</li>
                        <li><span><strong>Adj R²: </strong></span> ${formatNumber(stats.aR2)}</li>
                        <li><span><strong>RMSE: </strong></span> ${formatNumber(stats.rmse)}</li>
                        <li><span><strong>P-Value: </strong></span> ${stats.pVal < 0.0001 ? "< 0.0001" : formatNumber(stats.pVal)}</li>
                        <li><span><strong>SE: </strong></span> ${formatNumber(stats.se)}</li>
                        <li><span><strong>SSE: </strong></span> ${formatNumber(stats.sse)}</li>
                        <li><span><strong>F-Stat: </strong></span> ${formatNumber(stats.fStat)}</li>
                        <li><span><strong>AIC: </strong></span> ${formatNumber(stats.aic)}</li>
                        <li><span><strong>BIC: </strong></span> ${formatNumber(stats.bic)}</li>
                        <li><span><strong>DoF: </strong></span> ${stats.dof}</li>
                    </ul>
                </div>
            </div>
        `;
    }

    drawChart(lastX, lastY, result);
    updatePredictions(result);
}

export function clearResults() {
    const resultsCard = document.getElementById("resultsCard");
    const statisticsCard = document.getElementById("statisticsCard");
    if (resultsCard) resultsCard.classList.add("hidden");
    if (statisticsCard) statisticsCard.classList.add("hidden");
}

function drawChart(lastX, lastY, result) {
    const canvas = document.getElementById("fitChart");
    if (!canvas || typeof Chart === "undefined") return;
    if (fitChart) {
        fitChart.destroy();
    }
    const minX = Math.min(...lastX);
    const maxX = Math.max(...lastX);
    const curve = [];
    for (let i = 0; i <= 100; i++) {
        const x = minX + (maxX - minX) * i / 100;
        curve.push({ x, y: result.predict(x) });
    }
    fitChart = new Chart(canvas, {
        type: "scatter",
        data: {
            datasets: [
                {
                    label: "Observed Data",
                    data: lastX.map((x, i) => ({ x, y: lastY[i] })),
                    showLine: false
                },
                {
                    label: `Fitted Curve (${modelName(result)})`,
                    data: curve,
                    type: "line",
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { type: "linear", title: { display: true, text: "Concentration (X)" } },
                y: { title: { display: true, text: "Response (Y)" } }
            }
        }
    });
}