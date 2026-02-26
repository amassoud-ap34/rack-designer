// Run the app only after the HTML is fully loaded.
document.addEventListener('DOMContentLoaded', function () {
    // Rack has 42 standard units.
    const rackUnits = 42;
    // One rack unit height = 4.5 cm. Scale: 5 pixels per cm.
    const unitHeight = 22.5;
    // Cabinet padding = 4 cm on each side.
    const cabinetPadding = 20;
    // Rack inner width = 52 cm (including side labels).
    const rackWidth = 260;
    // Side gutter width for unit numbers inside the frame.
    const rackSideLabelWidth = 30;
    // Usable inner width for devices.
    const rackInnerWidth = rackWidth - rackSideLabelWidth;
    // Full rack height in pixels (42 units).
    const rackHeight = rackUnits * unitHeight;
    // Cabinet total dimensions (rack + padding on all sides).
    const cabinetWidth = rackWidth + (cabinetPadding * 2);
    const cabinetHeight = rackHeight + (cabinetPadding * 2);
    // Gap between racks when auto-placing.
    const rackGap = 40;

    // Main canvas host element.
    const container = document.getElementById('container');
    // Toolbar root element.
    const toolbar = document.getElementById('toolbar');
    // Collapsible toolbar body.
    const toolbarBody = document.getElementById('toolbarBody');
    // Toolbar collapse toggle button.
    const toggleToolbarBtn = document.getElementById('toggleToolbarBtn');
    // Toolbar pin/unpin button.
    const pinToolbarBtn = document.getElementById('pinToolbarBtn');
    // New project toolbar button.
    const newProjectToolbarBtn = document.getElementById('newProjectToolbarBtn');
    // Open project toolbar button.
    const openProjectToolbarBtn = document.getElementById('openProjectToolbarBtn');
    // Add rack button.
    const addRackBtn = document.getElementById('addRackBtn');
    // Delete selected item button.
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    // Download PNG button.
    const downloadPngBtn = document.getElementById('downloadPngBtn');
    // Save project JSON button.
    const saveProjectBtn = document.getElementById('saveProjectBtn');
    // Export project JSON button.
    const exportProjectBtn = document.getElementById('exportProjectBtn');
    // Auto-save status elements.
    const autoSaveStatus = document.getElementById('autoSaveStatus');
    const autoSaveText = document.getElementById('autoSaveText');
    // Project modal elements.
    const projectModal = document.getElementById('projectModal');
    const newProjectBtn = document.getElementById('newProjectBtn');
    const openProjectBtn = document.getElementById('openProjectBtn');
    const projectFileInput = document.getElementById('projectFileInput');
    // Color picker modal elements.
    const colorPickerModal = document.getElementById('colorPickerModal');
    const bgColorInput = document.getElementById('bgColorInput');
    const fontColorInput = document.getElementById('fontColorInput');
    const confirmColorBtn = document.getElementById('confirmColorBtn');
    const cancelColorBtn = document.getElementById('cancelColorBtn');
    // All device groups (1U/2U/3U/4U) in the palette.
    const deviceGroups = document.querySelectorAll('.device-group');

    // Track pinned mode for toolbar.
    let isToolbarPinned = true;
    // Track collapsed mode for toolbar.
    let isToolbarCollapsed = false;

    // Track unique rack id counter.
    let rackCounter = 0;
    // Track default rack-name counter.
    let nextRackNameNumber = 1;
    // Track currently selected node (rack or device).
    let selectedNode = null;
    // Track color picker callback when modal is open.
    let colorPickerCallback = null;
    // Track auto-save interval.
    let autoSaveInterval = null;

    // Create Konva stage on the container.
    const stage = new Konva.Stage({
        // DOM container id.
        container: 'container',
        // Initial stage width from container.
        width: container.clientWidth,
        // Initial stage height from container.
        height: container.clientHeight,
    });

    // Create background layer with watermark.
    const backgroundLayer = new Konva.Layer();
    stage.add(backgroundLayer);

    const watermark = new Konva.Text({
        text: 'rack-designer',
        fontSize: 120,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontStyle: 'bold',
        fill: '#9CA3AF',
        opacity: 0.3,
        listening: false,
    });

    // Center watermark horizontally and position higher vertically.
    watermark.position({
        x: (stage.width() - watermark.width()) / 2,
        y: (stage.height() - watermark.height()) / 2 - 100,
    });

    backgroundLayer.add(watermark);

    // Create one layer for all drawable shapes.
    const layer = new Konva.Layer();
    // Add the layer into stage.
    stage.add(layer);

    // Create tooltip layer for hover text.
    const tooltipLayer = new Konva.Layer();
    stage.add(tooltipLayer);

    const tooltip = new Konva.Label({
        opacity: 0,
        listening: false,
    });

    tooltip.add(new Konva.Tag({
        fill: '#2D3748',
        pointerDirection: 'down',
        pointerWidth: 10,
        pointerHeight: 5,
        lineJoin: 'round',
        shadowColor: 'rgba(0, 0, 0, 0.3)',
        shadowBlur: 5,
        shadowOffset: { x: 0, y: 2 },
    }));

    tooltip.add(new Konva.Text({
        text: '',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 13,
        padding: 8,
        fill: '#FFFFFF',
    }));

    tooltipLayer.add(tooltip);

    // Show tooltip for a device or shelf on hover.
    function attachTooltip(node) {
        node.on('mouseenter', function () {
            const name = node.getAttr('deviceName');
            const mousePos = stage.getPointerPosition();
            if (mousePos) {
                tooltip.getText().text(name);
                tooltip.position({ x: mousePos.x, y: mousePos.y - 10 });
                tooltip.opacity(0.95);
                tooltipLayer.batchDraw();
            }
        });
        node.on('mouseleave', function () {
            tooltip.opacity(0);
            tooltipLayer.batchDraw();
        });
    }

    // Keep a number inside min/max.
    function clamp(value, min, max) {
        return Math.max(min, Math.min(value, max));
    }

    // Get visible width for a device group.
    function getDeviceWidth(node) {
        return node.getAttr('deviceWidth') || rackInnerWidth;
    }

    // Convert selected display size to reserved rack size. Special rule: 4U consumes 6U.
    function getReservedUnits(displayUnits) {
        return displayUnits === 4 ? 6 : displayUnits;
    }

    // Resize workspace so full rack height is always reachable by scroll.
    function resizeWorkspace() {
        // Current browser viewport height.
        const viewportHeight = window.innerHeight;
        // Minimum canvas height: one rack plus extra margin.
        const minWorkspaceHeight = Math.ceil(rackHeight + (unitHeight * 2));
        // Final workspace height.
        const workspaceHeight = Math.max(viewportHeight, minWorkspaceHeight);

        // Apply computed height on container.
        container.style.height = `${workspaceHeight}px`;
        // Resize stage with current container width and computed height.
        stage.size({
            width: container.clientWidth,
            height: workspaceHeight,
        });
        // Redraw to reflect new size.
        layer.batchDraw();
    }

    // Sync toolbar classes, aria states, and workspace sizing.
    function syncToolbarState() {
        // Apply toolbar classes.
        toolbar.classList.toggle('collapsed', isToolbarCollapsed);
        toolbar.classList.toggle('pinned', isToolbarPinned);
        toolbar.classList.toggle('unpinned', !isToolbarPinned);
        document.body.classList.toggle('toolbar-pinned', isToolbarPinned);

        // Update UI controls.
        toggleToolbarBtn.textContent = isToolbarCollapsed ? '▶' : '◀';
        toggleToolbarBtn.setAttribute('aria-expanded', String(!isToolbarCollapsed));
        pinToolbarBtn.setAttribute('aria-pressed', String(isToolbarPinned));
        toolbarBody.hidden = isToolbarCollapsed;

        // Resize stage immediately.
        resizeWorkspace();
    }

    // Enable/disable delete button depending on selection.
    function updateDeleteButtonState() {
        deleteSelectedBtn.disabled = !selectedNode;
    }

    // Helper to apply border style to a node.
    function applyBorder(node, className, color, width) {
        const element = node.findOne(className);
        if (element) {
            element.stroke(color);
            element.strokeWidth(width);
        }
    }

    // Remove highlight from selected node.
    function clearSelection() {
        if (!selectedNode) {
            updateDeleteButtonState();
            return;
        }

        // Restore normal styles.
        if (selectedNode.hasName('rack')) {
            applyBorder(selectedNode, '.rack-frame', '#000000', 2);
        }
        if (selectedNode.hasName('device')) {
            applyBorder(selectedNode, '.device-body','#4a77a8', 1);
        }

        selectedNode = null;
        updateDeleteButtonState();
        layer.batchDraw();
    }

    // Apply selection highlight to a node.
    function selectNode(node) {
        if (selectedNode === node) return;

        clearSelection();
        selectedNode = node;

        // Apply highlight styles.
        if (node.hasName('rack')) {
            applyBorder(node, '.rack-frame', '#c24b2b', 3);
        }
        if (node.hasName('device')) {
            applyBorder(node, '.device-body', '#c24b2b', 2);
        }

        updateDeleteButtonState();
        layer.batchDraw();
    }

    // Delete selected rack/device.
    function deleteSelectedNode() {
        // Stop when no selection.
        if (!selectedNode) {
            return;
        }

        // Keep target reference.
        const nodeToDelete = selectedNode;
        // Clear selection first.
        clearSelection();
        // Release shelf slot if needed.
        if (nodeToDelete.hasName('device')) {
            releaseShelfSlotForDevice(nodeToDelete);
        }
        // Destroy node from layer tree.
        nodeToDelete.destroy();
        // Redraw layer.
        layer.batchDraw();
    }

    // Return true when two ranges overlap.
    function rangesOverlap(startA, sizeA, startB, sizeB) {
        return startA < startB + sizeB && startB < startA + sizeA;
    }

    // Find rack under a stage point.
    function getRackAtPoint(point) {
        // Read all rack groups.
        const racks = layer.find('.rack');

        // Scan each rack boundary.
        for (const rack of racks) {
            const rackPos = rack.getAbsolutePosition();
            const insideX = point.x >= rackPos.x && point.x <= rackPos.x + cabinetWidth;
            const insideY = point.y >= rackPos.y && point.y <= rackPos.y + cabinetHeight;

            // Return first rack containing point.
            if (insideX && insideY) {
                return rack;
            }
        }

        // Return null if no rack hit.
        return null;
    }

    // Convert drop point into preferred start unit.
    function getPreferredStartUnit(element, rack, dropPoint) {
        const rackPos = rack.getAbsolutePosition();
        const elementHeight = element.getAttr('deviceHeight');
        const roughY = dropPoint.y - rackPos.y - cabinetPadding - elementHeight / 2;
        const units = element.getAttr('units');
        const maxStartUnit = rackUnits - units;

        return Math.round(clamp(roughY / unitHeight, 0, maxStartUnit));
    }

    // Check whether a unit interval is free in a rack.
    function isUnitRangeFree(rack, startUnit, units, ignoreNode) {
        const elements = rack.find('.rack-element');

        for (const element of elements) {
            if (ignoreNode && element === ignoreNode) {
                continue;
            }

            // Ignore devices that live inside shelves.
            if (element.getAttr('inShelf')) {
                continue;
            }

            const elementStart = Math.round(element.y() / unitHeight);
            const elementUnits = element.getAttr('units');

            if (rangesOverlap(startUnit, units, elementStart, elementUnits)) {
                return false;
            }
        }

        return true;
    }

    // Find nearest free start unit around preferred one.
    function findNearestAvailableStartUnit(rack, units, preferredStartUnit, ignoreNode) {
        const maxStartUnit = rackUnits - units;
        let selectedStartUnit = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (let startUnit = 0; startUnit <= maxStartUnit; startUnit++) {
            if (!isUnitRangeFree(rack, startUnit, units, ignoreNode)) {
                continue;
            }

            const distance = Math.abs(startUnit - preferredStartUnit);
            if (distance < bestDistance) {
                bestDistance = distance;
                selectedStartUnit = startUnit;
            }
        }

        return selectedStartUnit;
    }

    // Find next free unit from top to bottom (used for auto-allocation).
    function findNextFreeUnitFromTop(rack, units) {
        const maxStartUnit = rackUnits - units;

        for (let startUnit = 0; startUnit <= maxStartUnit; startUnit++) {
            if (isUnitRangeFree(rack, startUnit, units, null)) {
                return startUnit;
            }
        }

        return null;
    }

    // Place a rack-element at one start unit.
    function placeElementAtStartUnit(element, rack, startUnit) {
        const snappedY = cabinetPadding + (startUnit * unitHeight);
        element.moveTo(rack);
        element.position({ x: cabinetPadding, y: snappedY });
    }

    // Place device into rack using reservation rules.
    function placeDeviceInRack(device, rack, dropPoint) {
        const units = device.getAttr('units');
        const preferredStartUnit = getPreferredStartUnit(device, rack, dropPoint);
        const startUnit = findNearestAvailableStartUnit(rack, units, preferredStartUnit, device);

        if (startUnit === null) {
            return false;
        }

        placeElementAtStartUnit(device, rack, startUnit);
        return true;
    }

    // Find a shelf device under a stage point.
    function getShelfAtPoint(point) {
        const shelves = layer.find('.device').filter((node) => node.getAttr('isShelf'));

        for (const shelf of shelves) {
            const shelfPos = shelf.getAbsolutePosition();
            const shelfWidth = rackInnerWidth;
            const shelfHeight = shelf.getAttr('deviceHeight');
            const insideX = point.x >= shelfPos.x && point.x <= shelfPos.x + shelfWidth;
            const insideY = point.y >= shelfPos.y && point.y <= shelfPos.y + shelfHeight;

            if (insideX && insideY) {
                return shelf;
            }
        }

        return null;
    }

    // Ensure shelf has a slot occupancy array.
    function ensureShelfSlots(shelf) {
        if (!shelf._slotOccupancy) {
            const numSlots = shelf.getAttr('numSlots');
            shelf._slotOccupancy = new Array(numSlots).fill(null);
        }
    }

    // Return the next free slot index from left to right.
    function getNextFreeShelfSlotIndex(shelf) {
        ensureShelfSlots(shelf);
        return shelf._slotOccupancy.findIndex((slot) => slot === null);
    }

    // Free a reserved shelf slot for a device.
    function releaseShelfSlotForDevice(device) {
        if (!device.getAttr('inShelf')) {
            return;
        }

        const shelf = device.getParent();
        if (!shelf || !shelf.getAttr('isShelf')) {
            return;
        }

        ensureShelfSlots(shelf);
        const slotIndex = device.getAttr('shelfSlotIndex');
        if (slotIndex !== null && slotIndex !== undefined) {
            shelf._slotOccupancy[slotIndex] = null;
        }

        device.setAttr('inShelf', false);
        device.setAttr('shelfSlotIndex', null);
    }

    // Check if a device can go into a shelf type.
    function isDeviceCompatibleWithShelf(device, shelf) {
        const shelfType = shelf.getAttr('shelfType') || '';
        const displayUnits = device.getAttr('displayUnits');

        if (displayUnits === 3) {
            return shelfType.startsWith('3u');
        }

        if (displayUnits === 4) {
            return shelfType.startsWith('6u');
        }

        return false;
    }

    // Place a device inside a shelf and reserve a slot.
    function placeDeviceInShelf(device, shelf, dropPoint) {
        if (!isDeviceCompatibleWithShelf(device, shelf)) {
            return false;
        }

        const numSlots = shelf.getAttr('numSlots');
        const slotWidth = rackInnerWidth / numSlots;
        const deviceWidth = getDeviceWidth(device);
        const slotIndex = getNextFreeShelfSlotIndex(shelf);

        if (slotIndex === -1) {
            return false;
        }

        const slotLeft = slotIndex * slotWidth;
        const localX = 0;

        device.moveTo(shelf);
        device.position({ x: slotLeft + localX, y: 0 });
        device.setAttr('inShelf', true);
        device.setAttr('shelfSlotIndex', slotIndex);
        shelf._slotOccupancy[slotIndex] = device;
        return true;
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

    // Create a shelf device with internal slots (vertical dividers).
    function createShelf(shelfType, elementName) {
        // Shelf configuration lookup.
        const shelfConfigs = {
            '3u-4': { displayUnits: 3, numSlots: 4, name: 'Shelf 3U (4 slots)' },
            '3u-6': { displayUnits: 3, numSlots: 6, name: 'Shelf 3U (6 slots)' },
            '6u-3': { displayUnits: 4, numSlots: 3, name: 'Shelf 6U (3 slots)' }, // 4 means 6U reserved
            '6u-4': { displayUnits: 4, numSlots: 4, name: 'Shelf 6U (4 slots)' }, // 4 means 6U reserved
        };

        const config = shelfConfigs[shelfType];
        const { displayUnits, numSlots } = config;
        const shelfName = elementName || config.name;
        const reservedUnits = getReservedUnits(displayUnits);
        const deviceHeight = reservedUnits * unitHeight;
        const slotWidth = rackInnerWidth / numSlots;

        // Shelf colors (neutral gray).
        const colors = { fill: '#E8E8E8', stroke: '#A0AEC0', text: '#2D3748' };

        const device = new Konva.Group({
            x: 0,
            y: 0,
            draggable: true,
            name: 'device rack-element',
        });

        device.setAttrs({
            units: reservedUnits,
            displayUnits,
            deviceHeight,
            deviceName: shelfName,
            customColor: null,
            isShelf: true,
            shelfType,
            numSlots,
            slotWidth,
        });

        device._slotOccupancy = new Array(numSlots).fill(null);

        // Shelf background.
        const body = new Konva.Rect({
            x: 0,
            y: 0,
            width: rackInnerWidth,
            height: deviceHeight,
            fill: colors.fill,
            stroke: colors.stroke,
            strokeWidth: 2,
            shadowColor: 'rgba(0, 0, 0, 0.08)',
            shadowBlur: 4,
            shadowOffset: { x: 0, y: 2 },
            cornerRadius: 4,
            name: 'device-body',
        });

        device.add(body);

        // Shelf label at top left.
        const label = new Konva.Text({
            x: 6,
            y: 4,
            width: rackInnerWidth - 12,
            height: 20,
            text: shelfName,
            fontSize: 11,
            fill: colors.text,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontStyle: '600',
            verticalAlign: 'top',
            align: 'left',
            wrap: 'none',
            ellipsis: true,
            listening: false,
            name: 'device-label',
        });

        device.add(label);

        // Vertical dividers for slots.
        for (let i = 1; i < numSlots; i++) {
            const xPos = i * slotWidth;
            device.add(new Konva.Line({
                points: [xPos, 0, xPos, deviceHeight],
                stroke: colors.stroke,
                strokeWidth: 1,
                listening: false,
            }));
        }

        device.on('click tap', function (event) {
            event.cancelBubble = true;
            selectNode(device);
        });

        device.on('dragstart', function () {
            selectNode(device);
            const originParent = device.getParent();
            device._originRack = originParent.hasName('rack') ? originParent : null;
            device._originShelf = originParent.getAttr('isShelf') ? originParent : null;
            device._originShelfSlotIndex = device.getAttr('shelfSlotIndex');
            device._originShelfLocalPos = { x: device.x(), y: device.y() };
            device._originStartUnit = Math.round(device.y() / unitHeight);
            device._originAbsolutePosition = device.getAbsolutePosition();

            const absolutePos = device.getAbsolutePosition();
            device.moveTo(layer);
            device.position(absolutePos);
            layer.batchDraw();
        });

        device.on('dragmove', function () {
            device.position({
                x: clamp(device.x(), 0, stage.width() - rackInnerWidth),
                y: clamp(device.y(), 0, stage.height() - device.getAttr('deviceHeight')),
            });
        });

        device.on('dragend', function () {
            const centerPoint = {
                x: device.x() + rackInnerWidth / 2,
                y: device.y() + device.getAttr('deviceHeight') / 2,
            };

            const targetRack = getRackAtPoint(centerPoint);
            let placed = false;

            if (targetRack) {
                placed = placeDeviceInRack(device, targetRack, centerPoint);
            }

            if (!placed && device._originRack && device._originRack.getStage()) {
                const fallbackStartUnit = findNearestAvailableStartUnit(
                    device._originRack,
                    device.getAttr('units'),
                    device._originStartUnit,
                    device,
                );

                if (fallbackStartUnit !== null) {
                    placeElementAtStartUnit(device, device._originRack, fallbackStartUnit);
                    placed = true;
                }
            }

            if (!placed && device._originAbsolutePosition) {
                device.moveTo(layer);
                device.position(device._originAbsolutePosition);
            }

            layer.batchDraw();
        });

        device.on('dblclick dbltap', function () {
            selectNode(device);
            const currentName = device.getAttr('deviceName');
            const nextName = window.prompt('Edit shelf name:', currentName);

            if (nextName === null) {
                return;
            }

            const cleanName = nextName.trim() || currentName;
            const textNode = device.findOne('.device-label');
            device.setAttr('deviceName', cleanName);
            textNode.text(cleanName);
            layer.batchDraw();
        });

        attachTooltip(device);

        return device;
    }

    // Create one draggable device node.
    function createDevice(displayUnits, elementName, customColor, customFontColor) {
        const reservedUnits = getReservedUnits(displayUnits);
        const deviceHeight = reservedUnits * unitHeight;
        const defaultName = elementName || `Device ${displayUnits}U`;

        // Calculate device width based on display units (for shelf compatibility).
        let deviceWidth = rackInnerWidth;
        if (displayUnits === 3) {
            deviceWidth = rackInnerWidth / 6;  // Fits in Shelf 3U (6 slots).
        } else if (displayUnits === 4) {
            deviceWidth = rackInnerWidth / 4;  // Fits in Shelf 6U (4 slots).
        }

        // Color palette based on device size (matching reference design).
        const colorSchemes = {
            1: { fill: '#FED7D7', stroke: '#FC8181', text: '#742A2A' },  // Red/Pink
            2: { fill: '#C6F6D5', stroke: '#68D391', text: '#22543D' },  // Green
            3: { fill: '#FEEBC8', stroke: '#F6AD55', text: '#7C2D12' },  // Orange/Peach
            4: { fill: '#BEE3F8', stroke: '#63B3ED', text: '#2C5282' },  // Blue
        };

        let colors = colorSchemes[displayUnits] || colorSchemes[4];

        // If custom color is provided, generate complementary colors.
        if (customColor) {
            colors = generateColorScheme(customColor, customFontColor);
        }

        const device = new Konva.Group({
            x: 0,
            y: 0,
            draggable: true,
            name: 'device rack-element',
        });

        device.setAttrs({
            units: reservedUnits,
            displayUnits,
            deviceHeight,
            deviceWidth,
            deviceName: defaultName,
            customColor: customColor || null,
            customFontColor: customFontColor || null,
        });

        const body = new Konva.Rect({
            x: 0,
            y: 0,
            width: deviceWidth,
            height: deviceHeight,
            fill: colors.fill,
            stroke: colors.stroke,
            strokeWidth: 1,
            shadowColor: 'rgba(0, 0, 0, 0.08)',
            shadowBlur: 4,
            shadowOffset: { x: 0, y: 2 },
            cornerRadius: 4,
            name: 'device-body',
        });

        const label = new Konva.Text({
            x: 3,
            y: 0,
            width: deviceWidth - 6,
            height: deviceHeight,
            text: defaultName,
            fontSize: Math.max(8, Math.min(13, deviceHeight - 2)),
            fill: colors.text,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontStyle: '500',
            verticalAlign: 'middle',
            align: 'center',
            wrap: 'none',
            ellipsis: true,
            listening: false,
            name: 'device-label',
        });

        device.add(body);
        device.add(label);

        device.on('click tap', function (event) {
            event.cancelBubble = true;
            selectNode(device);
        });

        device.on('dragstart', function () {
            selectNode(device);
            device._originRack = device.getParent().hasName('rack') ? device.getParent() : null;
            device._originStartUnit = Math.round(device.y() / unitHeight);
            device._originAbsolutePosition = device.getAbsolutePosition();

            // If moving from a shelf, release its slot.
            releaseShelfSlotForDevice(device);

            const absolutePos = device.getAbsolutePosition();
            device.moveTo(layer);
            device.position(absolutePos);
            layer.batchDraw();
        });

        device.on('dragmove', function () {
            const deviceWidth = getDeviceWidth(device);
            device.position({
                x: clamp(device.x(), 0, stage.width() - deviceWidth),
                y: clamp(device.y(), 0, stage.height() - device.getAttr('deviceHeight')),
            });
        });

        device.on('dragend', function () {
            const deviceWidth = getDeviceWidth(device);
            const centerPoint = {
                x: device.x() + deviceWidth / 2,
                y: device.y() + device.getAttr('deviceHeight') / 2,
            };

            const targetShelf = getShelfAtPoint(centerPoint);
            let placed = false;

            if (targetShelf) {
                placed = placeDeviceInShelf(device, targetShelf, centerPoint);
            }

            const displayUnits = device.getAttr('displayUnits');

            if (!placed && displayUnits !== 3 && displayUnits !== 4) {
                const targetRack = getRackAtPoint(centerPoint);
                if (targetRack) {
                    placed = placeDeviceInRack(device, targetRack, centerPoint);
                }
            }

            if (!placed && device._originShelf && device._originShelf.getStage()) {
                ensureShelfSlots(device._originShelf);
                const slotIndex = device._originShelfSlotIndex;

                if (slotIndex !== null && slotIndex !== undefined && !device._originShelf._slotOccupancy[slotIndex]) {
                    device.moveTo(device._originShelf);
                    device.position(device._originShelfLocalPos || { x: 0, y: 0 });
                    device.setAttr('inShelf', true);
                    device.setAttr('shelfSlotIndex', slotIndex);
                    device._originShelf._slotOccupancy[slotIndex] = device;
                    placed = true;
                }
            }

            if (!placed && device._originRack && device._originRack.getStage()) {
                const fallbackStartUnit = findNearestAvailableStartUnit(
                    device._originRack,
                    device.getAttr('units'),
                    device._originStartUnit,
                    device,
                );

                if (fallbackStartUnit !== null) {
                    placeElementAtStartUnit(device, device._originRack, fallbackStartUnit);
                    placed = true;
                }
            }

            if (!placed && device._originAbsolutePosition) {
                device.moveTo(layer);
                device.position(device._originAbsolutePosition);
            }

            layer.batchDraw();
        });

        device.on('dblclick dbltap', function () {
            selectNode(device);
            const currentName = device.getAttr('deviceName');
            const nextName = window.prompt('Edit device name:', currentName);

            if (nextName === null) {
                return;
            }

            const cleanName = nextName.trim() || currentName;
            const textNode = device.findOne('.device-label');
            device.setAttr('deviceName', cleanName);
            textNode.text(cleanName);
            layer.batchDraw();
        });

        attachTooltip(device);

        return device;
    }

    // Add a device into a target rack.
    function addDeviceToRack(displayUnits, rack, dropPoint, elementName, customColor, customFontColor, shelfType, useDropPoint) {
        let device;
        let reservedUnits;

        // Create shelf or regular device based on shelfType.
        if (shelfType) {
            device = createShelf(shelfType, elementName);
            reservedUnits = device.getAttr('units');
        } else {
            reservedUnits = getReservedUnits(displayUnits);
            device = createDevice(displayUnits, elementName, customColor, customFontColor);
        }

        let placed = false;

        // Use exact drop point if requested and not occupied.
        if (useDropPoint && dropPoint) {
            const preferredStartUnit = getPreferredStartUnit(device, rack, dropPoint);
            if (isUnitRangeFree(rack, preferredStartUnit, reservedUnits, null)) {
                placeElementAtStartUnit(device, rack, preferredStartUnit);
                placed = true;
            }
        }

        // Fall back to next free from top if exact placement failed.
        if (!placed) {
            const startUnit = findNextFreeUnitFromTop(rack, reservedUnits);
            if (startUnit !== null) {
                placeElementAtStartUnit(device, rack, startUnit);
                placed = true;
            }
        }

        if (!placed) {
            device.destroy();
            window.alert(`No free ${reservedUnits}U space in this rack.`);
            return;
        }

        layer.batchDraw();
    }

    // Build unit grid + side labels for one rack.
    function addRackUnitGrid(rack) {
        for (let i = 0; i < rackUnits; i++) {
            // Unit number counts from bottom to top.
            const unitNumber = rackUnits - i;
            
            // Add hover rectangle for each unit.
            const hoverRect = new Konva.Rect({
                x: cabinetPadding,
                y: cabinetPadding + (i * unitHeight),
                width: rackInnerWidth,
                height: unitHeight,
                fill: 'transparent',
                listening: true,
                name: 'unit-hover',
            });

            hoverRect.on('mouseenter', function () {
                hoverRect.fill('rgba(104, 119, 224, 0.08)');
                layer.batchDraw();
            });

            hoverRect.on('mouseleave', function () {
                hoverRect.fill('transparent');
                layer.batchDraw();
            });

            rack.add(hoverRect);

            rack.add(new Konva.Rect({
                x: cabinetPadding,
                y: cabinetPadding + (i * unitHeight),
                width: rackInnerWidth,
                height: unitHeight,
                stroke: '#E2E8F0',
                strokeWidth: 0.5,
                listening: false,
            }));

            rack.add(new Konva.Text({
                x: cabinetPadding + rackInnerWidth + 1,
                y: cabinetPadding + (i * unitHeight),
                width: rackSideLabelWidth - 2,
                height: unitHeight,
                text: String(unitNumber),
                fontSize: 9,
                fill: '#718096',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                align: 'center',
                verticalAlign: 'middle',
                listening: false,
            }));
        }
    }

    // Build one rack node with frame/header/labels.
    function createRack(x, y, rackName) {
        const rack = new Konva.Group({
            x,
            y,
            draggable: true,
            name: 'rack',
        });

        rack.setAttr('rackId', `rack-${++rackCounter}`);
        rack.setAttr('rackName', rackName);

        // Cabinet outer housing (4cm padding on all sides).
        rack.add(new Konva.Rect({
            x: 0,
            y: 0,
            width: cabinetWidth,
            height: cabinetHeight,
            stroke: '#4A5568',
            strokeWidth: 3,
            fill: '#2D3748',
            cornerRadius: 8,
            shadowColor: 'rgba(0, 0, 0, 0.15)',
            shadowBlur: 12,
            shadowOffset: { x: 0, y: 4 },
            name: 'cabinet-housing',
        }));

        // Rack frame (inside cabinet).
        rack.add(new Konva.Rect({
            x: cabinetPadding,
            y: cabinetPadding,
            width: rackWidth,
            height: rackHeight,
            stroke: '#CBD5E0',
            strokeWidth: 1,
            fill: '#FFFFFF',
            cornerRadius: 6,
            shadowColor: 'rgba(0, 0, 0, 0.06)',
            shadowBlur: 8,
            shadowOffset: { x: 0, y: 2 },
            name: 'rack-frame',
        }));

        // Rack header.
        rack.add(new Konva.Rect({
            x: cabinetPadding,
            y: cabinetPadding,
            width: rackInnerWidth,
            height: unitHeight,
            fill: '#FFFFFF',
            stroke: '#E2E8F0',
            strokeWidth: 0.5,
            cornerRadius: [6, 0, 0, 0],
            name: 'rack-header',
            listening: true,
        }));

        // Rack name label on cabinet housing (top center).
        rack.add(new Konva.Text({
            x: cabinetPadding,
            y: cabinetPadding / 2 - 6,
            width: cabinetWidth - (cabinetPadding * 2),
            height: 12,
            text: rack.getAttr('rackName'),
            fontSize: 11,
            fill: '#FFFFFF',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontStyle: '600',
            align: 'center',
            verticalAlign: 'middle',
            wrap: 'none',
            ellipsis: true,
            name: 'rack-name-label',
            listening: true,
        }));

        // Side label column background.
        rack.add(new Konva.Rect({
            x: cabinetPadding + rackInnerWidth,
            y: cabinetPadding,
            width: rackSideLabelWidth,
            height: rackHeight,
            fill: '#F7FAFC',
            listening: false,
        }));

        // Side label divider line.
        rack.add(new Konva.Line({
            points: [cabinetPadding + rackInnerWidth, cabinetPadding, cabinetPadding + rackInnerWidth, cabinetPadding + rackHeight],
            stroke: '#E2E8F0',
            strokeWidth: 1,
            listening: false,
        }));

        addRackUnitGrid(rack);

        rack.on('dragmove', function () {
            rack.position({
                x: clamp(rack.x(), 0, stage.width() - cabinetWidth),
                y: clamp(rack.y(), 0, stage.height() - cabinetHeight),
            });
        });

        rack.on('dragstart', function () {
            selectNode(rack);
        });

        rack.on('click tap', function (event) {
            event.cancelBubble = true;
            selectNode(rack);
        });

        rack.on('dblclick dbltap', function (event) {
            if (event.target.findAncestor('.device', true)) {
                return;
            }

            selectNode(rack);
            const currentRackName = rack.getAttr('rackName');
            const nextRackName = window.prompt('Edit rack name:', currentRackName);

            if (nextRackName === null) {
                return;
            }

            const cleanRackName = nextRackName.trim() || currentRackName;
            rack.setAttr('rackName', cleanRackName);
            rack.findOne('.rack-name-label').text(cleanRackName);
            nextRackNameNumber = 1;
            layer.batchDraw();
        });

        layer.add(rack);
        layer.batchDraw();
        return rack;
    }

    // Add a new rack at the next auto-position.
    function addRack() {
        const rackName = `Rack ${nextRackNameNumber}`;
        nextRackNameNumber += 1;

        const rackIndex = layer.find('.rack').length;
        const x = 20 + (rackIndex * (cabinetWidth + rackGap));
        const wrappedX = x > (stage.width() - cabinetWidth) ? 20 : x;
        const y = x > (stage.width() - cabinetWidth) ? 70 : 20;

        createRack(wrappedX, y, rackName);
    }

    // Get localStorage key for a device size category.
    function getStorageKeyForUnits(units) {
        return `customDevices_${units}`;
    }

    // Save custom devices list to localStorage.
    function saveCustomDevices(units, devicesList) {
        const key = getStorageKeyForUnits(units);
        localStorage.setItem(key, JSON.stringify(devicesList));
    }

    // Load custom devices list from localStorage.
    function loadCustomDevices(units) {
        const key = getStorageKeyForUnits(units);
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    }

    // Attach drag payload behavior to one palette element item.
    function attachElementDragBehavior(elementNode) {
        elementNode.setAttribute('draggable', 'true');

        elementNode.addEventListener('dragstart', function (event) {
            // Don't drag if delete button was clicked.
            if (event.target.classList && event.target.classList.contains('delete-device-btn')) {
                event.preventDefault();
                return;
            }

            const displayUnits = parseInt(elementNode.dataset.units, 10) || elementNode.dataset.units;
            const deviceName = elementNode.querySelector('.device-name')?.textContent?.trim() || elementNode.textContent.trim();
            const customColor = elementNode.dataset.color || null;
            const customFontColor = elementNode.dataset.fontColor || null;
            const shelfType = elementNode.dataset.shelfType || null;
            const payload = {
                units: displayUnits,
                name: deviceName,
                color: customColor,
                fontColor: customFontColor,
                shelfType: shelfType,
            };

            event.dataTransfer.setData('application/json', JSON.stringify(payload));
            event.dataTransfer.setData('text/plain', String(displayUnits));
        });
    }

    // Create palette element with optional delete button for custom devices.
    function createPaletteElement(name, units, color, fontColor, isCustom = false) {
        const newEntry = document.createElement('div');
        newEntry.className = 'palette-element';
        newEntry.dataset.units = String(units);
        if (color) {
            newEntry.dataset.color = color;
            newEntry.style.background = color;
        }
        if (fontColor) {
            newEntry.dataset.fontColor = fontColor;
            newEntry.style.color = fontColor;
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'device-name';
        nameSpan.textContent = name;
        newEntry.appendChild(nameSpan);

        if (isCustom) {
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-device-btn';
            editBtn.type = 'button';
            editBtn.textContent = '✎';
            editBtn.title = 'Edit this device';

            editBtn.addEventListener('click', function (event) {
                event.stopPropagation();
                
                const currentName = nameSpan.textContent;
                const currentBgColor = newEntry.dataset.color || '#FFFFFF';
                const currentFontColor = newEntry.dataset.fontColor || '#000000';

                showColorPicker(currentBgColor, currentFontColor, function (newBgColor, newFontColor) {
                    const newName = window.prompt('Edit device name:', currentName);
                    if (newName === null) {
                        return;
                    }

                    const cleanName = newName.trim() || currentName;

                    // Update palette element.
                    nameSpan.textContent = cleanName;
                    newEntry.dataset.color = newBgColor;
                    newEntry.dataset.fontColor = newFontColor;
                    newEntry.style.background = newBgColor;
                    newEntry.style.color = newFontColor;

                    // Update localStorage.
                    const customList = loadCustomDevices(units);
                    const updatedList = customList.map(item => 
                        item.name === currentName 
                            ? { name: cleanName, color: newBgColor, fontColor: newFontColor }
                            : item
                    );
                    saveCustomDevices(units, updatedList);
                });
            });

            newEntry.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-device-btn';
            deleteBtn.type = 'button';
            deleteBtn.textContent = '✕';
            deleteBtn.title = 'Delete this device';

            deleteBtn.addEventListener('click', function (event) {
                event.stopPropagation();
                
                // Get current name from the DOM (in case it was edited)
                const currentName = nameSpan.textContent;
                newEntry.remove();

                const customList = loadCustomDevices(units);
                const updatedList = customList.filter(item => item.name !== currentName);
                saveCustomDevices(units, updatedList);
            });

            newEntry.appendChild(deleteBtn);
        }

        attachElementDragBehavior(newEntry);
        return newEntry;
    }

    // Initialize expandable palette groups and add-item inputs.
    function initializeDevicePalette() {
        deviceGroups.forEach((group) => {
            const toggleBtn = group.querySelector('.device-group-toggle');
            const elementList = group.querySelector('.element-list');
            const displayUnits = group.dataset.units;
            const isShelfGroup = displayUnits.startsWith('shelf-');

            toggleBtn.addEventListener('click', function () {
                group.classList.toggle('open');
            });

            // Shelf groups don't have inputs, just pre-defined shelf types.
            if (isShelfGroup) {
                // Wire up drag behavior for pre-defined shelf elements.
                elementList.querySelectorAll('.palette-element').forEach((element) => {
                    attachElementDragBehavior(element);
                });
                return;
            }

            const nameInput = group.querySelector('.new-element-name');
            const colorPickerBtn = group.querySelector('.color-picker-btn');
            const addBtn = group.querySelector('.add-element-btn');
            const displayUnitsInt = parseInt(displayUnits, 10);

            // Handle color picker button clicks.
            colorPickerBtn.addEventListener('click', function () {
                const currentBgColor = colorPickerBtn.dataset.bgColor || '#FFFFFF';
                const currentFontColor = colorPickerBtn.dataset.fontColor || '#000000';

                showColorPicker(currentBgColor, currentFontColor, function (newBgColor, newFontColor) {
                    colorPickerBtn.dataset.bgColor = newBgColor;
                    colorPickerBtn.dataset.fontColor = newFontColor;
                    colorPickerBtn.querySelector('.color-preview').style.background = newBgColor;
                });
            });

            function addPaletteElementFromInput() {
                const nextName = nameInput.value.trim();
                if (!nextName) {
                    return;
                }

                const nextColor = colorPickerBtn.dataset.bgColor;
                const nextFontColor = colorPickerBtn.dataset.fontColor;
                const newEntry = createPaletteElement(nextName, displayUnitsInt, nextColor, nextFontColor, true);
                elementList.appendChild(newEntry);
                nameInput.value = '';

                const customList = loadCustomDevices(displayUnitsInt);
                customList.push({ name: nextName, color: nextColor, fontColor: nextFontColor });
                saveCustomDevices(displayUnitsInt, customList);
            }

            addBtn.addEventListener('click', addPaletteElementFromInput);

            nameInput.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    addPaletteElementFromInput();
                }
            });

            // Load and display custom devices from localStorage.
            const customDevices = loadCustomDevices(displayUnitsInt);
            customDevices.forEach((device) => {
                // Support legacy string format and new object format.
                const deviceName = typeof device === 'string' ? device : device.name;
                const deviceColor = typeof device === 'string' ? null : device.color;
                const deviceFontColor = typeof device === 'string' ? null : device.fontColor;
                const entry = createPaletteElement(deviceName, displayUnitsInt, deviceColor, deviceFontColor, true);
                elementList.appendChild(entry);
            });
        });
    }

    // Clear all racks/devices and reset counters.
    function resetWorkspace() {
        clearSelection();
        layer.destroyChildren();
        rackCounter = 0;
        nextRackNameNumber = 1;
        layer.batchDraw();
    }

    // Serialize a device (or shelf) for export.
    function serializeDevice(device) {
        const base = {
            x: device.x(),
            y: device.y(),
            units: device.getAttr('units'),
            displayUnits: device.getAttr('displayUnits'),
            name: device.getAttr('deviceName') || '',
            customColor: device.getAttr('customColor') || null,
            customFontColor: device.getAttr('customFontColor') || null,
            deviceWidth: device.getAttr('deviceWidth') || null,
            isShelf: Boolean(device.getAttr('isShelf')),
        };

        if (base.isShelf) {
            base.shelfType = device.getAttr('shelfType');
            base.numSlots = device.getAttr('numSlots');
            base.children = [];

            device.getChildren().forEach((child) => {
                if (!child.hasName || !child.hasName('device')) {
                    return;
                }

                base.children.push({
                    x: child.x(),
                    y: child.y(),
                    units: child.getAttr('units'),
                    displayUnits: child.getAttr('displayUnits'),
                    name: child.getAttr('deviceName') || '',
                    customColor: child.getAttr('customColor') || null,
                    customFontColor: child.getAttr('customFontColor') || null,
                    deviceWidth: child.getAttr('deviceWidth') || null,
                    shelfSlotIndex: child.getAttr('shelfSlotIndex'),
                });
            });
        }

        return base;
    }

    // Serialize the entire project for export.
    function serializeProject() {
        const racks = [];

        layer.find('.rack').forEach((rack) => {
            const rackData = {
                rackId: rack.getAttr('rackId'),
                rackName: rack.getAttr('rackName'),
                x: rack.x(),
                y: rack.y(),
                devices: [],
            };

            rack.getChildren().forEach((child) => {
                if (!child.hasName || !child.hasName('device')) {
                    return;
                }

                rackData.devices.push(serializeDevice(child));
            });

            racks.push(rackData);
        });

        return { version: 1, racks };
    }

    // Load a project JSON structure into the canvas.
    function loadProject(project) {
        if (!project || !Array.isArray(project.racks)) {
            throw new Error('Invalid project data.');
        }

        resetWorkspace();

        project.racks.forEach((rackData) => {
            const rackName = rackData.rackName || `Rack ${nextRackNameNumber}`;
            const rack = createRack(rackData.x || 20, rackData.y || 20, rackName);

            if (Array.isArray(rackData.devices)) {
                rackData.devices.forEach((deviceData) => {
                    if (deviceData.isShelf) {
                        const shelf = createShelf(deviceData.shelfType, deviceData.name);
                        shelf.position({ x: deviceData.x, y: deviceData.y });
                        rack.add(shelf);

                        if (Array.isArray(deviceData.children)) {
                            deviceData.children.forEach((childData) => {
                                const child = createDevice(childData.displayUnits, childData.name, childData.customColor, childData.customFontColor);
                                const slotIndex = childData.shelfSlotIndex;

                                child.setAttr('deviceWidth', childData.deviceWidth || getDeviceWidth(child));
                                child.moveTo(shelf);
                                child.position({ x: childData.x, y: childData.y });

                                if (slotIndex !== null && slotIndex !== undefined) {
                                    ensureShelfSlots(shelf);
                                    shelf._slotOccupancy[slotIndex] = child;
                                    child.setAttr('inShelf', true);
                                    child.setAttr('shelfSlotIndex', slotIndex);
                                }
                            });
                        }
                    } else {
                        const device = createDevice(deviceData.displayUnits, deviceData.name, deviceData.customColor, deviceData.customFontColor);
                        device.setAttr('deviceWidth', deviceData.deviceWidth || getDeviceWidth(device));
                        device.position({ x: deviceData.x, y: deviceData.y });
                        rack.add(device);
                    }
                });
            }
        });

        nextRackNameNumber = layer.find('.rack').length + 1;
        layer.batchDraw();
    }

    // Download current project as a JSON file.
    function saveProject() {
        const defaultName = 'rack-project';
        const filename = window.prompt('Enter project filename:', defaultName);
        
        if (filename === null) return; // User cancelled
        
        const cleanFilename = filename.trim() || defaultName;
        const finalFilename = cleanFilename.endsWith('.json') ? cleanFilename : `${cleanFilename}.json`;
        
        downloadProjectFile(finalFilename);
    }

    // Export current project as a JSON file.
    function exportProject() {
        downloadProjectFile('rack-project.json');
    }

    // Helper to download project as JSON file.
    function downloadProjectFile(filename) {
        const data = serializeProject();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        triggerDownload(url, filename);
        URL.revokeObjectURL(url);
        
        // Save to localStorage for auto-recovery.
        localStorage.setItem('rack-designer-autosave', json);
        localStorage.setItem('rack-designer-autosave-timestamp', new Date().toISOString());
    }

    // Toggle modal visibility.
    function toggleModal(modal, show) {
        modal.classList.toggle('hidden', !show);
    }

    // Show/hide project modal.
    function showProjectModal() { toggleModal(projectModal, true); }
    function hideProjectModal() { toggleModal(projectModal, false); }

    // Auto-save project to localStorage.
    function performAutoSave() {
        try {
            const data = serializeProject();
            const json = JSON.stringify(data);
            localStorage.setItem('rack-designer-autosave', json);
            localStorage.setItem('rack-designer-autosave-timestamp', new Date().toISOString());
            
            // Show save confirmation briefly
            if (autoSaveText) {
                const now = new Date();
                autoSaveText.textContent = `Auto-saved at ${now.toLocaleTimeString()}`;
                autoSaveStatus.style.color = '#48BB78';
                setTimeout(function () {
                    autoSaveStatus.style.color = '#718096';
                }, 2000);
            }
        } catch (error) {
            console.warn('Auto-save failed:', error);
            if (autoSaveText) {
                autoSaveText.textContent = 'Auto-save failed';
                autoSaveStatus.style.color = '#E53E3E';
            }
        }
    }

    // Start auto-save timer (saves every 2 minutes).
    function startAutoSave() {
        if (autoSaveInterval) {
            clearInterval(autoSaveInterval);
        }
        autoSaveInterval = setInterval(performAutoSave, 120000); // 2 minutes
        
        // Show auto-save status
        if (autoSaveStatus) {
            autoSaveStatus.style.display = 'block';
            autoSaveText.textContent = 'Auto-save enabled';
        }
        
        // Perform initial auto-save
        performAutoSave();
    }

    // Stop auto-save timer.
    function stopAutoSave() {
        if (autoSaveInterval) {
            clearInterval(autoSaveInterval);
            autoSaveInterval = null;
        }
    }

    // Check for auto-saved project and offer recovery.
    function checkAutoSaveRecovery() {
        const autosave = localStorage.getItem('rack-designer-autosave');
        const timestamp = localStorage.getItem('rack-designer-autosave-timestamp');
        
        if (autosave && timestamp) {
            const saveDate = new Date(timestamp);
            const now = new Date();
            const hoursDiff = (now - saveDate) / (1000 * 60 * 60);
            
            // Only offer recovery if save is less than 24 hours old
            if (hoursDiff < 24) {
                const formattedDate = saveDate.toLocaleString();
                const recover = window.confirm(
                    `Found auto-saved project from ${formattedDate}.\n\nDo you want to recover it?`
                );
                
                if (recover) {
                    try {
                        const data = JSON.parse(autosave);
                        loadProject(data);
                        hideProjectModal();
                        startAutoSave();
                        return true;
                    } catch (error) {
                        window.alert('Could not recover auto-saved project.');
                    }
                }
            }
        }
        
        return false;
    }

    // Show color picker modal with callback.
    function showColorPicker(bgColor, fontColor, callback) {
        bgColorInput.value = bgColor;
        fontColorInput.value = fontColor;
        colorPickerCallback = callback;
        toggleModal(colorPickerModal, true);
    }

    // Hide color picker modal.
    function hideColorPicker() {
        toggleModal(colorPickerModal, false);
        colorPickerCallback = null;
    }

    // Wire up project modal actions.
    function initializeProjectModal() {
        newProjectBtn.addEventListener('click', function () {
            resetWorkspace();
            hideProjectModal();
            startAutoSave();
        });

        openProjectBtn.addEventListener('click', function () {
            projectFileInput.value = '';
            projectFileInput.click();
        });

        projectFileInput.addEventListener('change', function (event) {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = function () {
                try {
                    const data = JSON.parse(reader.result);
                    loadProject(data);
                    hideProjectModal();
                    startAutoSave();
                } catch (error) {
                    window.alert('Could not load this project file.');
                }
            };

            reader.readAsText(file);
        });
    }

    // Wire up color picker modal actions.
    function initializeColorPickerModal() {
        confirmColorBtn.addEventListener('click', function () {
            if (colorPickerCallback) {
                colorPickerCallback(bgColorInput.value, fontColorInput.value);
            }
            hideColorPicker();
        });

        cancelColorBtn.addEventListener('click', function () {
            hideColorPicker();
        });
    }

    // Helper to trigger file download.
    function triggerDownload(href, filename) {
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Download the current canvas as a PNG file.
    function downloadRackAsPng() {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `rack-designer-${timestamp}.png`;
        const dataURL = stage.toDataURL({ pixelRatio: 2 });
        triggerDownload(dataURL, filename);
    }

    // --- Toolbar behavior ---

    toggleToolbarBtn.addEventListener('click', function () {
        isToolbarCollapsed = !isToolbarCollapsed;
        syncToolbarState();
    });

    pinToolbarBtn.addEventListener('click', function () {
        isToolbarPinned = !isToolbarPinned;
        isToolbarCollapsed = !isToolbarPinned;
        syncToolbarState();
    });

    toolbar.addEventListener('mouseenter', function () {
        if (!isToolbarPinned) {
            isToolbarCollapsed = false;
            syncToolbarState();
        }
    });

    toolbar.addEventListener('mouseleave', function () {
        if (!isToolbarPinned) {
            isToolbarCollapsed = true;
            syncToolbarState();
        }
    });

    addRackBtn.addEventListener('click', addRack);
    deleteSelectedBtn.addEventListener('click', deleteSelectedNode);
    downloadPngBtn.addEventListener('click', downloadRackAsPng);
    saveProjectBtn.addEventListener('click', saveProject);
    exportProjectBtn.addEventListener('click', exportProject);
    
    newProjectToolbarBtn.addEventListener('click', function () {
        const confirm = window.confirm('Start a new project? Any unsaved changes will be lost.');
        if (confirm) {
            resetWorkspace();
            startAutoSave();
        }
    });
    
    openProjectToolbarBtn.addEventListener('click', function () {
        projectFileInput.value = '';
        projectFileInput.click();
    });

    // --- Drag/drop from palette to canvas ---

    container.addEventListener('dragover', function (event) {
        event.preventDefault();
    });

    container.addEventListener('drop', function (event) {
        event.preventDefault();
        stage.setPointersPositions(event);

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        // Parse drag data with fallback defaults.
        let units, elementName = '', customColor = null, customFontColor = null, shelfType = null;
        const jsonPayload = event.dataTransfer.getData('application/json');
        
        if (jsonPayload) {
            try {
                const parsed = JSON.parse(jsonPayload);
                units = parseInt(parsed.units, 10) || parsed.units;
                elementName = (parsed.name || '').trim();
                customColor = parsed.color || null;
                customFontColor = parsed.fontColor || null;
                shelfType = parsed.shelfType || null;
            } catch (error) {
                units = parseInt(event.dataTransfer.getData('text/plain'), 10);
            }
        } else {
            units = parseInt(event.dataTransfer.getData('text/plain'), 10);
        }

        // If shelf type is present, units might be a string like "shelf-3u".
        if (!shelfType && Number.isNaN(units)) return;

        const targetShelf = getShelfAtPoint(pointer);
        if (targetShelf && !shelfType) {
            const device = createDevice(parseInt(units, 10), elementName, customColor, customFontColor);
            const placed = placeDeviceInShelf(device, targetShelf, pointer);

            if (!placed) {
                device.destroy();
                window.alert('No free shelf slot available.');
            } else {
                layer.batchDraw();
            }

            return;
        }

        if (!shelfType && (units === 3 || units === 4)) {
            window.alert('Place this device into a matching shelf slot.');
            return;
        }

        const targetRack = getRackAtPoint(pointer);
        if (!targetRack) {
            return;
        }

        addDeviceToRack(parseInt(units, 10), targetRack, pointer, elementName, customColor, customFontColor, shelfType, true);
    });

    // --- Global events ---

    window.addEventListener('resize', function () {
        resizeWorkspace();
    });

    stage.on('click tap', function (event) {
        if (event.target === stage) {
            clearSelection();
        }
    });

    window.addEventListener('keydown', function (event) {
        const activeTag = (document.activeElement && document.activeElement.tagName) || '';
        const isTypingContext = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement.isContentEditable;

        if (isTypingContext) {
            return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            deleteSelectedNode();
        }
    });

    // Initialize palette interactions.
    initializeDevicePalette();
    // Initialize project modal interactions.
    initializeProjectModal();
    // Initialize color picker modal interactions.
    initializeColorPickerModal();
    // Initialize toolbar visuals/layout.
    syncToolbarState();
    // Initialize delete button status.
    updateDeleteButtonState();
    
    // Check for auto-save recovery and show project modal if not recovered.
    const recovered = checkAutoSaveRecovery();
    if (!recovered) {
        showProjectModal();
    }

    // Expose layout serializer helper for quick debugging/export.
    window.saveLayout = function () {
        const racks = [];

        layer.find('.rack').forEach((rack) => {
            const devices = [];

            rack.find('.device').forEach((device) => {
                devices.push({
                    y: device.y(),
                    units: device.getAttr('units'),
                    displayUnits: device.getAttr('displayUnits'),
                    name: device.getAttr('deviceName'),
                });
            });

            racks.push({
                rackId: rack.getAttr('rackId'),
                rackName: rack.getAttr('rackName'),
                x: rack.x(),
                y: rack.y(),
                devices,
            });
        });

        console.log(JSON.stringify(racks));
    };
});
