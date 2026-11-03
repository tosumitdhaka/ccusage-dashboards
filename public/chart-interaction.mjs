import { formatMetric } from "./formatting.mjs";
const bindings = new WeakMap();
let activeOwner = null;
let activeHide = null;
export function nearestPointIndex(points, x) {
    if (!points.length)
        return -1;
    let best = 0;
    let bestDistance = Math.abs(points[0].x - x);
    for (let index = 1; index < points.length; index++) {
        const distance = Math.abs(points[index].x - x);
        if (distance < bestDistance) {
            best = index;
            bestDistance = distance;
        }
    }
    return best;
}
function ensureTooltip() {
    let tooltip = document.getElementById("chart-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "chart-tooltip";
        tooltip.className = "chart-tooltip";
        tooltip.setAttribute("role", "tooltip");
        document.body.append(tooltip);
    }
    return tooltip;
}
function positionTooltip(tooltip, x, y) {
    const safeX = Math.max(110, Math.min(window.innerWidth - 110, x));
    tooltip.style.left = safeX + "px";
    if (y < 110) {
        tooltip.style.top = y + 16 + "px";
        tooltip.style.transform = "translateX(-50%)";
    }
    else {
        tooltip.style.top = y - 12 + "px";
        tooltip.style.transform = "translate(-50%, -100%)";
    }
}
export function hideActiveChartInteraction() {
    activeHide?.();
}
export function clearLineChartInteraction(svg) {
    const cleanup = bindings.get(svg);
    if (cleanup)
        cleanup();
    bindings.delete(svg);
}
export function bindLineChartInteraction(svg, options) {
    clearLineChartInteraction(svg);
    if (!options.points.length || !options.series.length)
        return () => { };
    const tooltip = ensureTooltip();
    const ns = "http://www.w3.org/2000/svg";
    const crosshair = document.createElementNS(ns, "line");
    crosshair.setAttribute("class", "chart-crosshair");
    crosshair.setAttribute("aria-hidden", "true");
    crosshair.setAttribute("hidden", "");
    const focusDot = document.createElementNS(ns, "circle");
    focusDot.setAttribute("class", "chart-focus-dot");
    focusDot.setAttribute("r", "5");
    focusDot.setAttribute("aria-hidden", "true");
    focusDot.setAttribute("hidden", "");
    svg.append(crosshair, focusDot);
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown");
    const paths = [...svg.querySelectorAll("[data-series-name]")];
    const viewBox = svg.viewBox.baseVal;
    const yTop = viewBox.y + 12;
    const yBottom = viewBox.y + viewBox.height - 36;
    let pointIndex = -1;
    let keyboardSeriesIndex = -1;
    let hoverSeriesIndex = -1;
    let pointerFrame = 0;
    let pendingPointer = null;
    const emphasize = (seriesIndex) => {
        const selectedName = seriesIndex >= 0 ? options.series[seriesIndex]?.name : null;
        for (const path of paths) {
            const active = selectedName !== null && path.getAttribute("data-series-name") === selectedName;
            path.classList.toggle("is-emphasized", active);
            path.classList.toggle("is-dimmed", selectedName !== null && !active);
        }
    };
    const hide = () => {
        crosshair.setAttribute("hidden", "");
        focusDot.setAttribute("hidden", "");
        tooltip.hidden = true;
        tooltip.setAttribute("hidden", "");
        tooltip.setAttribute("aria-hidden", "true");
        emphasize(-1);
        if (activeOwner === svg) {
            activeOwner = null;
            activeHide = null;
        }
    };
    const header = document.createElement("div");
    header.className = "chart-tooltip-header";
    const seriesList = document.createElement("div");
    seriesList.className = "chart-tooltip-series";
    const rows = options.series.map((series) => {
        const row = document.createElement("div");
        row.className = "chart-tooltip-row";
        const swatch = document.createElement("span");
        swatch.className = "chart-tooltip-swatch";
        swatch.style.background = series.color;
        const name = document.createElement("span");
        name.className = "chart-tooltip-name";
        name.textContent = series.name;
        const value = document.createElement("span");
        value.className = "chart-tooltip-value";
        row.append(swatch, name, value);
        seriesList.append(row);
        return { row, value };
    });
    const show = (index, clientX, clientY, selectedSeriesIndex) => {
        if (index < 0 || index >= options.points.length)
            return;
        pointIndex = index;
        const point = options.points[index];
        crosshair.removeAttribute("hidden");
        crosshair.setAttribute("x1", String(point.x));
        crosshair.setAttribute("x2", String(point.x));
        crosshair.setAttribute("y1", String(yTop));
        crosshair.setAttribute("y2", String(yBottom));
        const selectedSeries = selectedSeriesIndex >= 0 ? options.series[selectedSeriesIndex] : null;
        if (selectedSeries?.points[index]) {
            focusDot.removeAttribute("hidden");
            focusDot.setAttribute("cx", String(point.x));
            focusDot.setAttribute("cy", String(selectedSeries.points[index].y));
            focusDot.style.stroke = selectedSeries.color;
        }
        else {
            focusDot.setAttribute("hidden", "");
        }
        emphasize(selectedSeriesIndex);
            // Rows are created once per bound chart and reused for every pointer frame.
        if (tooltip.firstChild !== header)
            tooltip.replaceChildren(header, seriesList);
        header.textContent = point.label;
        const accessible = [point.label];
        options.series.forEach((series, seriesIndex) => {
            const { row, value } = rows[seriesIndex];
            row.classList.toggle("is-active", seriesIndex === selectedSeriesIndex);
            const formatted = formatMetric(series.points[index]?.value ?? 0, options.metric);
            value.textContent = formatted;
            accessible.push(series.name + " " + formatted);
        });
    tooltip.hidden = false;
        tooltip.removeAttribute("hidden");
        tooltip.setAttribute("aria-hidden", "false");
        svg.setAttribute("aria-description", accessible.join(". "));
        positionTooltip(tooltip, clientX, clientY);
        activeOwner = svg;
        activeHide = hide;
    };
    const clientCoordinatesForPoint = (index) => {
        const rect = svg.getBoundingClientRect();
        const point = options.points[index];
        const width = viewBox.width || 1;
        return {
            x: rect.left + ((point.x - viewBox.x) / width) * rect.width,
            y: rect.top + Math.min(Math.max(56, rect.height * .4), Math.max(56, rect.height - 24))
        };
    };
    const onPointerMove = (event) => {
        pendingPointer = { x: event.clientX, y: event.clientY };
        if (pointerFrame)
            return;
        pointerFrame = requestAnimationFrame(() => {
            pointerFrame = 0;
            const pending = pendingPointer;
            pendingPointer = null;
            if (!pending)
                return;
            const rect = svg.getBoundingClientRect();
            if (!rect.width)
                return;
            const viewX = viewBox.x + ((pending.x - rect.left) / rect.width) * viewBox.width;
            const index = nearestPointIndex(options.points, viewX);
            show(index, pending.x, pending.y, hoverSeriesIndex);
        });
    };
    const onPointerLeave = () => {
        pendingPointer = null;
        if (document.activeElement !== svg)
            hide();
    };
    const onFocus = () => {
        if (pointIndex < 0)
            pointIndex = 0;
        const client = clientCoordinatesForPoint(pointIndex);
        show(pointIndex, client.x, client.y, keyboardSeriesIndex);
    };
    const onBlur = () => hide();
    const onKeyDown = (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
            return;
        event.preventDefault();
        if (pointIndex < 0)
            pointIndex = 0;
        if (event.key === "ArrowLeft")
            pointIndex = Math.max(0, pointIndex - 1);
        if (event.key === "ArrowRight")
            pointIndex = Math.min(options.points.length - 1, pointIndex + 1);
        if (event.key === "ArrowUp") {
            keyboardSeriesIndex = keyboardSeriesIndex <= 0 ? options.series.length - 1 : keyboardSeriesIndex - 1;
        }
        if (event.key === "ArrowDown") {
            keyboardSeriesIndex = keyboardSeriesIndex < 0 || keyboardSeriesIndex >= options.series.length - 1
                ? 0 : keyboardSeriesIndex + 1;
        }
        const client = clientCoordinatesForPoint(pointIndex);
        show(pointIndex, client.x, client.y, keyboardSeriesIndex);
    };
    const pathDisposers = [];
    paths.forEach((path) => {
        const name = path.getAttribute("data-series-name");
        const index = options.series.findIndex((series) => series.name === name);
        if (index < 0)
            return;
        const enter = () => {
            hoverSeriesIndex = index;
            emphasize(index);
        };
        const leave = () => {
            hoverSeriesIndex = -1;
            if (document.activeElement !== svg)
                emphasize(-1);
        };
        path.addEventListener("pointerenter", enter);
        path.addEventListener("pointerleave", leave);
        pathDisposers.push(() => {
            path.removeEventListener("pointerenter", enter);
            path.removeEventListener("pointerleave", leave);
        });
    });
    svg.addEventListener("pointermove", onPointerMove, { passive: true });
    svg.addEventListener("pointerleave", onPointerLeave);
    svg.addEventListener("focus", onFocus);
    svg.addEventListener("blur", onBlur);
    svg.addEventListener("keydown", onKeyDown);
    const cleanup = () => {
        if (pointerFrame)
            cancelAnimationFrame(pointerFrame);
        svg.removeEventListener("pointermove", onPointerMove);
        svg.removeEventListener("pointerleave", onPointerLeave);
        svg.removeEventListener("focus", onFocus);
        svg.removeEventListener("blur", onBlur);
        svg.removeEventListener("keydown", onKeyDown);
        for (const dispose of pathDisposers)
            dispose();
        hide();
    };
    bindings.set(svg, cleanup);
    return cleanup;
}
