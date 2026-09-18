export function formatNumber(value, significant = 8) {
    if (!Number.isFinite(value)) return "N/A";
    return Number(value).toPrecision(significant);
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function showError(message) {
    const el = document.getElementById("inputError");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
}

export function clearError() {
    const el = document.getElementById("inputError");
    if (el) {
        el.textContent = "";
        el.classList.add("hidden");
    }
}