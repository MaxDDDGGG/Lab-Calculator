/* ============================================================
   PARSE TWO-COLUMN INPUT DATA
   ============================================================

   Accepts data pasted directly from Excel / Google Sheets:

   Concentration (X)    Response (Y)
   0.1                  1
   0.2                  1.3
   0.3                  1.5
   0.4                  1.8

   Tabs are preferred, but commas are also supported.

   Blank rows are ignored.
   An optional header row is ignored.
   ============================================================ */

function parseInputData() {

    const inputElement =
        document.getElementById("dataInput");

    if (!inputElement) {
        throw new Error(
            "Data input field could not be found."
        );
    }

    const input =
        inputElement.value.trim();

    if (!input) {
        throw new Error(
            "Please paste your concentration and response data."
        );
    }


    const rows =
        input.split(/\r?\n/);

    const xValues = [];
    const yValues = [];


    rows.forEach((row, index) => {

        const trimmedRow =
            row.trim();


        /* ----------------------------------------------------
           Ignore blank rows
           ---------------------------------------------------- */

        if (!trimmedRow) {
            return;
        }


        /* ----------------------------------------------------
           Split columns

           Excel / Google Sheets:
               tab-separated

           Also allow:
               comma-separated
        ---------------------------------------------------- */

        let columns;

        if (row.includes("\t")) {

            columns =
                row.split("\t");

        } else {

            columns =
                row.split(",");

        }


        if (columns.length < 2) {

            throw new Error(
                `Row ${index + 1} does not contain two columns.`
            );

        }


        const xText =
            columns[0].trim();

        const yText =
            columns[1].trim();


        /* ----------------------------------------------------
           Ignore completely empty rows
           ---------------------------------------------------- */

        if (!xText && !yText) {
            return;
        }


        const x =
            Number(xText);

        const y =
            Number(yText);


        /* ----------------------------------------------------
           Optional header

           Examples:

           Concentration    Response
           Concentration (X)    Response (Y)
           X    Y
        ---------------------------------------------------- */

        const looksLikeHeader =
            index === 0 &&
            (
                !Number.isFinite(x) &&
                !Number.isFinite(y)
            );

        if (looksLikeHeader) {
            return;
        }


        /* ----------------------------------------------------
           Validate numeric values
        ---------------------------------------------------- */

        if (!Number.isFinite(x)) {

            throw new Error(
                `Invalid concentration on row ${index + 1}: "${xText}".`
            );

        }


        if (!Number.isFinite(y)) {

            throw new Error(
                `Invalid response on row ${index + 1}: "${yText}".`
            );

        }


        xValues.push(x);
        yValues.push(y);

    });


    /* --------------------------------------------------------
       Minimum data requirement
       -------------------------------------------------------- */

    if (xValues.length < 4) {

        throw new Error(
            "At least four valid concentration/response pairs are required."
        );

    }


    return {
        xValues,
        yValues
    };
}


/* ============================================================
   UPDATE DATA PREVIEW
   ============================================================ */

function updateDataPreview() {

    const preview =
        document.getElementById("dataPreview");

    const tbody =
        document.getElementById("dataPreviewBody");

    const count =
        document.getElementById("dataCount");

    const error =
        document.getElementById("inputError");


    if (!preview || !tbody || !count || !error) {
        return;
    }


    tbody.innerHTML = "";

    error.textContent = "";

    error.classList.add("hidden");


    const inputElement =
        document.getElementById("dataInput");


    if (!inputElement || !inputElement.value.trim()) {

        preview.classList.add("hidden");

        return;

    }


    try {

        const {
            xValues,
            yValues
        } = parseInputData();


        xValues.forEach((x, i) => {

            const row =
                document.createElement("tr");


            const xCell =
                document.createElement("td");

            xCell.textContent =
                formatNumber(x);


            const yCell =
                document.createElement("td");

            yCell.textContent =
                formatNumber(yValues[i]);


            row.appendChild(xCell);

            row.appendChild(yCell);

            tbody.appendChild(row);

        });


        count.textContent =
            `${xValues.length} data point${
                xValues.length === 1
                    ? ""
                    : "s"
            }`;


        preview.classList.remove("hidden");


    } catch (errorObject) {

        preview.classList.add("hidden");

        error.textContent =
            errorObject.message;

        error.classList.remove("hidden");

    }
}


/* ============================================================
   MAIN CALCULATION
   ============================================================ */

function calculate4PL() {

    try {

        clearError();


        /* ----------------------------------------------------
           Read the new two-column input
        ---------------------------------------------------- */

        const {
            xValues,
            yValues
        } = parseInputData();


        /* ----------------------------------------------------
           Fit 4PL
        ---------------------------------------------------- */

        const result =
            fit4PL(
                xValues,
                yValues
            );


        /* ----------------------------------------------------
           Store result for chart resizing
        ---------------------------------------------------- */

        lastX =
            xValues;

        lastY =
            yValues;

        lastResult =
            result;


        /* ----------------------------------------------------
           Display results
        ---------------------------------------------------- */

        displayResults(
            result,
            xValues,
            yValues
        );


        console.log(
            "4PL fit:",
            result
        );


    } catch (error) {

        console.error(
            "4PL calculation error:",
            error
        );

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


        const inputCard =
            document.querySelector(
                ".card"
            );


        if (inputCard) {

            inputCard.appendChild(
                errorBox
            );

        } else {

            document.body.appendChild(
                errorBox
            );

        }

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

        errorBox.textContent =
            "";

        errorBox.classList.remove(
            "visible"
        );

    }


    const inputError =
        document.getElementById(
            "inputError"
        );


    if (inputError) {

        inputError.textContent =
            "";

        inputError.classList.add(
            "hidden"
        );

    }

}


/* ============================================================
   CLEAR CALCULATOR
   ============================================================ */

function clearCalculator() {

    const dataInput =
        document.getElementById(
            "dataInput"
        );


    if (dataInput) {

        dataInput.value =
            "";

    }


    const results =
        document.getElementById(
            "results"
        );


    if (results) {

        results.classList.add(
            "hidden"
        );

    }


    const preview =
        document.getElementById(
            "dataPreview"
        );


    if (preview) {

        preview.classList.add(
            "hidden"
        );

    }


    const tbody =
        document.getElementById(
            "dataPreviewBody"
        );


    if (tbody) {

        tbody.innerHTML =
            "";

    }


    clearError();


    lastX =
        null;

    lastY =
        null;

    lastResult =
        null;

}


/* ============================================================
   EXAMPLE DATA
   ============================================================ */

function loadExample() {

    const dataInput =
        document.getElementById(
            "dataInput"
        );


    if (!dataInput) {
        return;
    }


    dataInput.value =
`Concentration (X)\tResponse (Y)
0.1\t0.12
0.5\t0.25
1\t0.48
5\t0.72
10\t0.86
50\t0.95`;


    updateDataPreview();

    clearError();

    calculate4PL();

}


/* ============================================================
   LAST CALCULATION
   Used for responsive chart redraw.
   ============================================================ */

let lastX =
    null;

let lastY =
    null;

let lastResult =
    null;


/* ============================================================
   WINDOW RESIZE
   ============================================================ */

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
   BUTTON / INPUT EVENTS
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const dataInput =
            document.getElementById(
                "dataInput"
            );


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


        /* ----------------------------------------------------
           Live preview when data is pasted/edited
        ---------------------------------------------------- */

        if (dataInput) {

            dataInput.addEventListener(
                "input",
                updateDataPreview
            );

        }


        /* ----------------------------------------------------
           Calculate
        ---------------------------------------------------- */

        if (calculateButton) {

            calculateButton.addEventListener(
                "click",
                calculate4PL
            );

        }


        /* ----------------------------------------------------
           Example
        ---------------------------------------------------- */

        if (exampleButton) {

            exampleButton.addEventListener(
                "click",
                loadExample
            );

        }


        /* ----------------------------------------------------
           Clear
        ---------------------------------------------------- */

        if (clearButton) {

            clearButton.addEventListener(
                "click",
                clearCalculator
            );

        }

    }
);


/* ============================================================
   MAKE FUNCTIONS AVAILABLE TO HTML
   ============================================================ */

window.calculate4PL =
    calculate4PL;

window.loadExample =
    loadExample;

window.clearCalculator =
    clearCalculator;


/* ============================================================
   LOADED
   ============================================================ */

console.log(
    "4PL Laboratory Calculator loaded."
);