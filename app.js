"use strict";

/* ============================================================
   4PL LABORATORY CALCULATOR

   Model:
   y = D + (A - D) / (1 + (x / C)^B)
   ============================================================ */


/* ============================================================
   4PL MODEL
   ============================================================ */

function fourPL(x, A, B, C, D) {
    return D + (A - D) / (1 + Math.pow(x / C, B));
}


/* ============================================================
   READ NUMBERS FROM TEXT
   Accepts:
   - commas
   - spaces
   - tabs
   - new lines
   - semicolons
   ============================================================ */

function parseNumbers(text) {

    return text
        .trim()
        .split(/[\s,;]+/)
        .map(Number)
        .filter(Number.isFinite);

}


/* ============================================================
   NUMBER FORMATTING
   ============================================================ */

function formatNumber(value, significantFigures = 6) {

    if (!Number.isFinite(value)) {
        return "—";
    }

    if (value === 0) {
        return "0";
    }

    const absolute = Math.abs(value);

    if (absolute >= 0.001 && absolute < 100000) {
        return Number(value.toPrecision(significantFigures)).toString();
    }

    return value.toExponential(3);
}


/* ============================================================
   4PL FIT
   ============================================================ */

function fit4PL(x, y) {

    if (x.length !== y.length) {
        throw new Error(
            "X and Y must contain the same number of values."
        );
    }

    if (x.length < 4) {
        throw new Error(
            "Enter at least 4 standard points."
        );
    }

    if (x.some(v => v <= 0)) {
        throw new Error(
            "All concentrations must be greater than 0."
        );
    }

    if (new Set(x).size < 4) {
        throw new Error(
            "You need at least 4 different concentrations."
        );
    }

    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    const rangeY = maxY - minY;

    if (rangeY === 0) {
        throw new Error(
            "The response values cannot all be the same."
        );
    }

    const minX = Math.min(...x);
    const maxX = Math.max(...x);

    let best = null;


    /* --------------------------------------------------------
       Grid search

       B controls the slope.

       C is the concentration at the inflection point.

       A and D are estimated from the response limits.
       -------------------------------------------------------- */

    for (let B = -10; B <= 10; B += 0.25) {

        if (Math.abs(B) < 0.01) {
            continue;
        }

        for (let i = 0; i <= 200; i++) {

            const fraction = i / 200;

            const logC =
                Math.log(minX) +
                fraction *
                (Math.log(maxX) - Math.log(minX));

            const C = Math.exp(logC);

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

                const predicted =
                    fourPL(x[j], A, B, C, D);

                const residual =
                    y[j] - predicted;

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
        throw new Error(
            "Unable to fit the 4PL curve."
        );
    }


    /* --------------------------------------------------------
       Predictions
       -------------------------------------------------------- */

    const predictions = x.map(value =>
        fourPL(
            value,
            best.A,
            best.B,
            best.C,
            best.D
        )
    );


    /* --------------------------------------------------------
       R²
       -------------------------------------------------------- */

    const meanY =
        y.reduce((a, b) => a + b, 0) / y.length;

    let ssTotal = 0;
    let ssResidual = 0;

    for (let i = 0; i < y.length; i++) {

        ssTotal +=
            Math.pow(y[i] - meanY, 2);

        ssResidual +=
            Math.pow(y[i] - predictions[i], 2);
    }

    const r2 =
        ssTotal === 0
            ? 0
            : 1 - (ssResidual / ssTotal);


    /* --------------------------------------------------------
       RMSE
       -------------------------------------------------------- */

    const rmse =
        Math.sqrt(
            ssResidual / y.length
        );


    return {

        ...best,

        predictions,

        r2,

        rmse

    };
}


/* ============================================================
   CREATE LOGARITHMIC X VALUES
   ============================================================ */

function createLogXValues(minX, maxX, count = 300) {

    const values = [];

    const minLog = Math.log10(minX);
    const maxLog = Math.log10(maxX);

    for (let i = 0; i < count; i++) {

        const fraction =
            i / (count - 1);

        const logValue =
            minLog +
            fraction *
            (maxLog - minLog);

        values.push(
            Math.pow(10, logValue)
        );
    }

    return values;
}


/* ============================================================
   DRAW GRAPH
   ============================================================ */

function drawChart(x, y, result) {

    const canvas =
        document.getElementById("chart");

    if (!canvas) {
        return;
    }

    const container =
        canvas.parentElement;

    const rect =
        container.getBoundingClientRect();

    const width =
        Math.max(rect.width, 320);

    const height = 430;

    const pixelRatio =
        window.devicePixelRatio || 1;

    canvas.width =
        width * pixelRatio;

    canvas.height =
        height * pixelRatio;

    canvas.style.width =
        `${width}px`;

    canvas.style.height =
        `${height}px`;

    const ctx =
        canvas.getContext("2d");

    ctx.setTransform(
        pixelRatio,
        0,
        0,
        pixelRatio,
        0,
        0
    );


    /* --------------------------------------------------------
       Graph dimensions
       -------------------------------------------------------- */

    const margin = {

        left: 65,

        right: 25,

        top: 25,

        bottom: 60

    };

    const plotWidth =
        width -
        margin.left -
        margin.right;

    const plotHeight =
        height -
        margin.top -
        margin.bottom;


    /* --------------------------------------------------------
       Generate fitted curve
       -------------------------------------------------------- */

    const curveX =
        createLogXValues(
            Math.min(...x),
            Math.max(...x)
        );

    const curveY =
        curveX.map(value =>
            fourPL(
                value,
                result.A,
                result.B,
                result.C,
                result.D
            )
        );


    /* --------------------------------------------------------
       Y limits
       -------------------------------------------------------- */

    const allY = [
        ...y,
        ...curveY
    ];

    let yMin =
        Math.min(...allY);

    let yMax =
        Math.max(...allY);

    let yRange =
        yMax - yMin;

    if (yRange === 0) {
        yRange = 1;
    }

    const padding =
        yRange * 0.10;

    yMin -= padding;
    yMax += padding;


    /* --------------------------------------------------------
       X limits
       -------------------------------------------------------- */

    const xMin =
        Math.min(...x);

    const xMax =
        Math.max(...x);

    const logXMin =
        Math.log10(xMin);

    const logXMax =
        Math.log10(xMax);


    /* --------------------------------------------------------
       Coordinate conversion
       -------------------------------------------------------- */

    function mapX(value) {

        return margin.left +
            (
                (Math.log10(value) - logXMin) /
                (logXMax - logXMin)
            ) *
            plotWidth;
    }


    function mapY(value) {

        return margin.top +
            plotHeight -
            (
                (value - yMin) /
                (yMax - yMin)
            ) *
            plotHeight;
    }


    /* --------------------------------------------------------
       Background
       -------------------------------------------------------- */

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    ctx.fillStyle =
        "#ffffff";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    /* --------------------------------------------------------
       Grid
       -------------------------------------------------------- */

    ctx.strokeStyle =
        "#e5e7eb";

    ctx.lineWidth = 1;

    ctx.font =
        "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    ctx.fillStyle =
        "#6b7280";


    /* --------------------------------------------------------
       Y grid
       -------------------------------------------------------- */

    const yTicks = 6;

    for (let i = 0; i <= yTicks; i++) {

        const value =
            yMin +
            (i / yTicks) *
            (yMax - yMin);

        const py =
            mapY(value);

        ctx.beginPath();

        ctx.moveTo(
            margin.left,
            py
        );

        ctx.lineTo(
            margin.left + plotWidth,
            py
        );

        ctx.stroke();

        ctx.textAlign =
            "right";

        ctx.textBaseline =
            "middle";

        ctx.fillText(
            formatNumber(value, 4),
            margin.left - 10,
            py
        );
    }


    /* --------------------------------------------------------
       Log X grid
       -------------------------------------------------------- */

    const firstDecade =
        Math.floor(logXMin);

    const lastDecade =
        Math.ceil(logXMax);

    for (
        let decade = firstDecade;
        decade <= lastDecade;
        decade++
    ) {

        const multipliers =
            [1, 2, 5];

        for (const multiplier of multipliers) {

            const value =
                multiplier *
                Math.pow(10, decade);

            if (
                value < xMin ||
                value > xMax
            ) {
                continue;
            }

            const px =
                mapX(value);

            ctx.beginPath();

            ctx.moveTo(
                px,
                margin.top
            );

            ctx.lineTo(
                px,
                margin.top + plotHeight
            );

            ctx.stroke();

            ctx.textAlign =
                "center";

            ctx.textBaseline =
                "top";

            ctx.fillText(
                formatAxisNumber(value),
                px,
                margin.top + plotHeight + 10
            );
        }
    }


    /* --------------------------------------------------------
       Axes
       -------------------------------------------------------- */

    ctx.strokeStyle =
        "#374151";

    ctx.lineWidth = 1.5;

    ctx.beginPath();

    ctx.moveTo(
        margin.left,
        margin.top
    );

    ctx.lineTo(
        margin.left,
        margin.top + plotHeight
    );

    ctx.lineTo(
        margin.left + plotWidth,
        margin.top + plotHeight
    );

    ctx.stroke();


    /* --------------------------------------------------------
       Fitted curve
       -------------------------------------------------------- */

    ctx.strokeStyle =
        "#2563eb";

    ctx.lineWidth = 3;

    ctx.beginPath();

    curveX.forEach(
        (value, index) => {

            const px =
                mapX(value);

            const py =
                mapY(curveY[index]);

            if (index === 0) {

                ctx.moveTo(
                    px,
                    py
                );

            } else {

                ctx.lineTo(
                    px,
                    py
                );
            }
        }
    );

    ctx.stroke();


    /* --------------------------------------------------------
       Experimental points
       -------------------------------------------------------- */

    ctx.fillStyle =
        "#111827";

    for (let i = 0; i < x.length; i++) {

        const px =
            mapX(x[i]);

        const py =
            mapY(y[i]);

        ctx.beginPath();

        ctx.arc(
            px,
            py,
            5,
            0,
            Math.PI * 2
        );

        ctx.fill();

    }


    /* --------------------------------------------------------
       Axis labels
       -------------------------------------------------------- */

    ctx.fillStyle =
        "#374151";

    ctx.font =
        "600 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "alphabetic";

    ctx.fillText(
        "Concentration",
        margin.left +
            plotWidth / 2,
        height - 15
    );


    ctx.save();

    ctx.translate(
        17,
        margin.top +
            plotHeight / 2
    );

    ctx.rotate(-Math.PI / 2);

    ctx.fillText(
        "Response",
        0,
        0
    );

    ctx.restore();


    /* --------------------------------------------------------
       Legend
       -------------------------------------------------------- */

    const legendY =
        14;

    ctx.fillStyle =
        "#111827";

    ctx.beginPath();

    ctx.arc(
        width - 150,
        legendY,
        4,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.font =
        "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    ctx.textAlign =
        "left";

    ctx.textBaseline =
        "middle";

    ctx.fillText(
        "Standards",
        width - 140,
        legendY
    );


    ctx.strokeStyle =
        "#2563eb";

    ctx.lineWidth = 3;

    ctx.beginPath();

    ctx.moveTo(
        width - 75,
        legendY
    );

    ctx.lineTo(
        width - 55,
        legendY
    );

    ctx.stroke();

    ctx.fillStyle =
        "#111827";

    ctx.fillText(
        "4PL fit",
        width - 50,
        legendY
    );
}


/* ============================================================
   FORMAT GRAPH AXIS NUMBERS
   ============================================================ */

function formatAxisNumber(value) {

    if (
        value >= 0.01 &&
        value < 1000
    ) {

        return Number(
            value.toPrecision(3)
        ).toString();

    }

    return value.toExponential(0);
}


/* ============================================================
   DISPLAY RESULTS
   ============================================================ */

function displayResults(result, x, y) {

    const results =
        document.getElementById("results");

    const parameters =
        document.getElementById("parameters");


    results.classList.remove(
        "hidden"
    );


    parameters.innerHTML = `

        <div class="result-header">

            <div>
                <span class="eyebrow">
                    FIT COMPLETE
                </span>

                <h2>4PL Parameters</h2>
            </div>

            <div class="point-count">
                ${x.length} standards
            </div>

        </div>


        <div class="parameter-grid">

            <div class="parameter-card">

                <span class="parameter-name">
                    A
                </span>

                <span class="parameter-label">
                    Upper asymptote
                </span>

                <strong>
                    ${formatNumber(result.A)}
                </strong>

            </div>


            <div class="parameter-card">

                <span class="parameter-name">
                    B
                </span>

                <span class="parameter-label">
                    Slope
                </span>

                <strong>
                    ${formatNumber(result.B)}
                </strong>

            </div>


            <div class="parameter-card highlight">

                <span class="parameter-name">
                    C
                </span>

                <span class="parameter-label">
                    Inflection point
                </span>

                <strong>
                    ${formatNumber(result.C)}
                </strong>

            </div>


            <div class="parameter-card">

                <span class="parameter-name">
                    D
                </span>

                <span class="parameter-label">
                    Lower asymptote
                </span>

                <strong>
                    ${formatNumber(result.D)}
                </strong>

            </div>

        </div>


        <div class="fit-stats">

            <div>

                <span>R²</span>

                <strong>
                    ${result.r2.toFixed(5)}
                </strong>

            </div>


            <div>

                <span>RMSE</span>

                <strong>
                    ${formatNumber(result.rmse)}
                </strong>

            </div>


            <div>

                <span>Data points</span>

                <strong>
                    ${x.length}
                </strong>

            </div>

        </div>


        <div class="equation-box">

            <span>4PL equation</span>

            <code>
                y = D + (A − D) / [1 + (x / C)<sup>B</sup>]
            </code>

        </div>

    `;


    drawChart(
        x,
        y,
        result
    );


    results.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* ============================================================
   MAIN CALCULATION
   ============================================================ */

function calculate4PL() {

    try {

        const xText =
            document.getElementById(
                "xValues"
            ).value;

        const yText =
            document.getElementById(
                "yValues"
            ).value;


        const x =
            parseNumbers(xText);

        const y =
            parseNumbers(yText);


        if (x.length === 0) {

            throw new Error(
                "Please enter concentration values."
            );

        }


        if (y.length === 0) {

            throw new Error(
                "Please enter response values."
            );

        }


        const result =
            fit4PL(x, y);


        displayResults(
            result,
            x,
            y
        );


        console.log(
            "4PL fit:",
            result
        );


    } catch (error) {

        console.error(error);

        showError(
            error.message
        );

    }
}


/* ============================================================
   ERROR MESSAGE
   ============================================================ */

function showError(message) {

    let errorBox =
        document.getElementById(
            "errorMessage"
        );

    if (!errorBox) {

        errorBox =
            document.createElement(
                "div"
            );

        errorBox.id =
            "errorMessage";

        errorBox.className =
            "error-message";

        const card =
            document.querySelector(
                ".card"
            );

        card.appendChild(
            errorBox
        );
    }

    errorBox.textContent =
        message;

    errorBox.classList.add(
        "visible"
    );
}


/* ============================================================
   CLEAR ERROR
   ============================================================ */

function clearError() {

    const errorBox =
        document.getElementById(
            "errorMessage"
        );

    if (errorBox) {

        errorBox.classList.remove(
            "visible"
        );

    }
}


/* ============================================================
   CLEAR CALCULATOR
   ============================================================ */

function clearCalculator() {

    document.getElementById(
        "xValues"
    ).value = "";

    document.getElementById(
        "yValues"
    ).value = "";

    document.getElementById(
        "results"
    ).classList.add(
        "hidden"
    );

    clearError();
}


/* ============================================================
   EXAMPLE DATA
   ============================================================ */

function loadExample() {

    document.getElementById(
        "xValues"
    ).value =
        "0.1, 0.5, 1, 5, 10, 50";

    document.getElementById(
        "yValues"
    ).value =
        "0.12, 0.25, 0.48, 0.72, 0.86, 0.95";

    clearError();

    calculate4PL();
}


/* ============================================================
   WINDOW RESIZE
   Redraw graph when screen size changes.
   ============================================================ */

let lastX = null;
let lastY = null;
let lastResult = null;

const originalDisplayResults =
    displayResults;

displayResults = function(
    result,
    x,
    y
) {

    lastX = x;
    lastY = y;
    lastResult = result;

    originalDisplayResults(
        result,
        x,
        y
    );
};


window.addEventListener(
    "resize",
    () => {

        if (
            lastX &&
            lastY &&
            lastResult
        ) {

            drawChart(
                lastX,
                lastY,
                lastResult
            );

        }

    }
);


/* ============================================================
   BUTTON EVENTS
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const calculateButton =
            document.getElementById(
                "calculateButton"
            );

        const exampleButton =
            document.getElementById(
                "exampleButton"
            );

        const clearButton =
            document.getElementById(
                "clearButton"
            );


        if (calculateButton) {

            calculateButton.addEventListener(
                "click",
                () => {

                    clearError();

                    calculate4PL();

                }
            );

        }


        if (exampleButton) {

            exampleButton.addEventListener(
                "click",
                loadExample
            );

        }


        if (clearButton) {

            clearButton.addEventListener(
                "click",
                clearCalculator
            );

        }

    }
);


/* ============================================================
   MAKE AVAILABLE TO HTML
   ============================================================ */

window.calculate4PL =
    calculate4PL;

window.loadExample =
    loadExample;

window.clearCalculator =
    clearCalculator;


console.log(
    "4PL Laboratory Calculator loaded."
);