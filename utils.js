// Utility and Helper Functions

// Debounce function to limit how often a function can fire.
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Keep a number inside min/max.
function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

// Convert selected display size to reserved rack size. Special rule: 4U consumes 6U.
function getReservedUnits(displayUnits) {
    return displayUnits === 4 ? 6 : displayUnits;
}

// Helper to apply border style to a node.
function applyBorder(node, className, color, width) {
    const element = node.findOne(className);
    if (element) {
        element.stroke(color);
        element.strokeWidth(width);
    }
}

// Toggle modal visibility.
function toggleModal(modal, show) {
    modal.classList.toggle('hidden', !show);
}

// Trigger file download from a URL.
function triggerDownload(href, filename) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Generate color scheme from a fill color (darker stroke and text).
function generateColorScheme(fillColor, customTextColor) {
    // Parse hex color to RGB.
    const hex = fillColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Helper to convert RGB to hex.
    const toHex = (r, g, b) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    // Generate darker stroke (multiply by 0.7) and optional text color (multiply by 0.3).
    const stroke = toHex(Math.round(r * 0.7), Math.round(g * 0.7), Math.round(b * 0.7));
    const text = customTextColor || toHex(Math.round(r * 0.3), Math.round(g * 0.3), Math.round(b * 0.3));

    return { fill: fillColor, stroke, text };
}

// Check if two ranges overlap on a unit scale.
function rangesOverlap(startA, sizeA, startB, sizeB) {
    return startA < startB + sizeB && startA + sizeA > startB;
}

// Get visible width for a device group.
function getDeviceWidth(node) {
    return node.getAttr('deviceWidth') || rackInnerWidth;
}

// Get storage key for custom devices by unit size.
function getStorageKeyForUnits(units) {
    return `rack-designer-devices-${units}U`;
}
