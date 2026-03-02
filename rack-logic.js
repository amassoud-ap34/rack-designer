// Rack Creation and Device Placement Logic
// Depends on: constants.js, utils.js, and app state variables (stage, layer, tooltipLayer, etc.)

function refreshSchemaElementStats() {
    if (typeof window.updateSchemaElementStats === 'function') {
        window.updateSchemaElementStats();
    }
}

// Find rack under a stage point.
function getRackAtPoint(point) {
    const racks = appState.layer.find('.rack');

    for (const rack of racks) {
        const rackPos = rack.getAbsolutePosition();
        const insideX = point.x >= rackPos.x && point.x <= rackPos.x + cabinetWidth;
        const insideY = point.y >= rackPos.y && point.y <= rackPos.y + cabinetHeight;

        if (insideX && insideY) {
            return rack;
        }
    }

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
    const shelves = appState.layer.find('.device').filter((node) => node.getAttr('isShelf'));

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
        if (Number.isInteger(numSlots) && numSlots > 0) {
            shelf._slotOccupancy = new Array(numSlots).fill(null);
        } else {
            shelf._slotOccupancy = [];
        }
    }
}

// Return the next free slot index from left to right.
function getNextFreeShelfSlotIndex(shelf) {
    ensureShelfSlots(shelf);
    if (!shelf._slotOccupancy.length) {
        return -1;
    }
    return shelf._slotOccupancy.findIndex((slot) => slot === null);
}

function placeDeviceInBlinderShelf(device, shelf) {
    const shelfHeight = shelf.getAttr('deviceHeight') || 0;
    const shelfWidth = rackInnerWidth;
    const deviceWidth = getDeviceWidth(device);
    const deviceHeight = device.getAttr('deviceHeight') || 0;

    const siblings = shelf.getChildren().filter((child) => child.hasName && child.hasName('device'));
    let nextX = 0;

    siblings.forEach((child) => {
        const childRight = child.x() + getDeviceWidth(child);
        if (childRight > nextX) {
            nextX = childRight;
        }
    });

    if (nextX + deviceWidth > shelfWidth) {
        return false;
    }

    const centeredY = Math.max(0, Math.round((shelfHeight - deviceHeight) / 2));
    device.moveTo(shelf);
    device.position({ x: nextX, y: centeredY });
    device.setAttr('inShelf', true);
    device.setAttr('shelfSlotIndex', null);
    return true;
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
    if (shelf.getAttr('acceptsAnyElement')) {
        return true;
    }

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

    if (shelf.getAttr('acceptsAnyElement')) {
        return placeDeviceInBlinderShelf(device, shelf);
    }

    const numSlots = shelf.getAttr('numSlots');
    const slotWidth = rackInnerWidth / numSlots;
    const slotIndex = getNextFreeShelfSlotIndex(shelf);

    if (slotIndex === -1) {
        return false;
    }

    const slotLeft = slotIndex * slotWidth;

    device.moveTo(shelf);
    device.position({ x: slotLeft, y: 0 });
    device.setAttr('inShelf', true);
    device.setAttr('shelfSlotIndex', slotIndex);
    shelf._slotOccupancy[slotIndex] = device;
    return true;
}

// Place a device in a specific shelf slot index.
function placeDeviceInShelfSlot(device, shelf, slotIndex) {
    if (shelf.getAttr('acceptsAnyElement')) {
        return false;
    }

    if (!isDeviceCompatibleWithShelf(device, shelf)) {
        return false;
    }

    const numSlots = shelf.getAttr('numSlots');
    if (slotIndex < 0 || slotIndex >= numSlots) {
        return false;
    }

    ensureShelfSlots(shelf);
    if (shelf._slotOccupancy[slotIndex]) {
        return false;
    }

    const slotWidth = rackInnerWidth / numSlots;
    const slotLeft = slotIndex * slotWidth;

    device.moveTo(shelf);
    device.position({ x: slotLeft, y: 0 });
    device.setAttr('inShelf', true);
    device.setAttr('shelfSlotIndex', slotIndex);
    shelf._slotOccupancy[slotIndex] = device;
    return true;
}

// Place palette payload on an exact rack unit.
function placePayloadAtRackUnit(payload, rack, startUnit) {
    const shelfType = payload.shelfType || null;
    const displayUnits = parseInt(payload.units, 10) || payload.units;

    if (!shelfType && (displayUnits === 3 || displayUnits === 4)) {
        window.alert('Place this device into a matching shelf slot.');
        return false;
    }

    let element;
    if (shelfType) {
        element = createShelf(shelfType, payload.name);
    } else {
        element = createDevice(displayUnits, payload.name, payload.color || null, payload.fontColor || null);
    }

    const units = element.getAttr('units');
    const maxStartUnit = rackUnits - units;
    const normalizedStart = clamp(startUnit, 0, maxStartUnit);

    if (!isUnitRangeFree(rack, normalizedStart, units, null)) {
        element.destroy();
        window.alert(`No free ${units}U space at this rack unit.`);
        return false;
    }

    placeElementAtStartUnit(element, rack, normalizedStart);
    appState.layer.batchDraw();
    refreshSchemaElementStats();
    if (typeof window.saveAutoSaveSilently === 'function') {
        window.saveAutoSaveSilently();
    }
    return true;
}

// Place palette payload into a specific shelf slot.
function placePayloadInShelfSlot(payload, shelf, slotIndex) {
    if (payload.shelfType) {
        window.alert('Shelf elements must be placed on rack units.');
        return false;
    }

    const displayUnits = parseInt(payload.units, 10) || payload.units;
    const device = createDevice(displayUnits, payload.name, payload.color || null, payload.fontColor || null);
    const placed = placeDeviceInShelfSlot(device, shelf, slotIndex);

    if (!placed) {
        device.destroy();
        window.alert('Selected shelf slot is not available for this device.');
        return false;
    }

    appState.layer.batchDraw();
    refreshSchemaElementStats();
    if (typeof window.saveAutoSaveSilently === 'function') {
        window.saveAutoSaveSilently();
    }
    return true;
}

function placePayloadInBlinderShelf(payload, shelf) {
    if (payload.shelfType) {
        window.alert('Shelf elements must be placed on rack units.');
        return false;
    }

    const displayUnits = parseInt(payload.units, 10) || payload.units;
    const device = createDevice(displayUnits, payload.name, payload.color || null, payload.fontColor || null);
    const placed = placeDeviceInShelf(device, shelf, null);

    if (!placed) {
        device.destroy();
        window.alert('No available space on this shelf for the selected element.');
        return false;
    }

    appState.layer.batchDraw();
    refreshSchemaElementStats();
    if (typeof window.saveAutoSaveSilently === 'function') {
        window.saveAutoSaveSilently();
    }
    return true;
}

// Create a shelf device with internal slots (vertical dividers).
function createShelf(shelfType, elementName) {
    const shelfConfigs = {
        '3u-blinder': { displayUnits: 3, numSlots: 0, name: 'Shelf 3U (Blinder)', acceptsAnyElement: true },
        '3u-4': { displayUnits: 3, numSlots: 4, name: 'Shelf 3U (4 slots)' },
        '3u-6': { displayUnits: 3, numSlots: 6, name: 'Shelf 3U (6 slots)' },
        '6u-3': { displayUnits: 4, numSlots: 3, name: 'Shelf 6U (3 slots)' },
        '6u-4': { displayUnits: 4, numSlots: 4, name: 'Shelf 6U (4 slots)' },
    };

    const normalizedShelfType = shelfType === '3u-4' && /blinder/i.test(elementName || '')
        ? '3u-blinder'
        : shelfType;
    const config = shelfConfigs[normalizedShelfType] || shelfConfigs['3u-4'];
    const { displayUnits, numSlots } = config;
    const shelfName = elementName || config.name;
    const reservedUnits = getReservedUnits(displayUnits);
    const deviceHeight = reservedUnits * unitHeight;
    const slotWidth = numSlots > 0 ? rackInnerWidth / numSlots : null;

    const colors = { fill: '#E8E8E8', stroke: '#A0AEC0', text: '#2D3748' };

    const device = new Konva.Group({
        x: 0,
        y: 0,
        draggable: false,
        name: 'device rack-element',
    });

    device.setAttrs({
        units: reservedUnits,
        displayUnits,
        deviceHeight,
        deviceName: shelfName,
        customColor: null,
        isShelf: true,
        shelfType: normalizedShelfType,
        numSlots,
        slotWidth,
        acceptsAnyElement: Boolean(config.acceptsAnyElement),
    });

    device._slotOccupancy = numSlots > 0 ? new Array(numSlots).fill(null) : [];

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

    const label = new Konva.Text({
        x: 6,
        y: 4,
        width: rackInnerWidth - 12,
        height: 20,
        text: shelfName,
        fontSize: 15,
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

    if (numSlots > 0) {
        for (let i = 1; i < numSlots; i++) {
            const xPos = i * slotWidth;
            device.add(new Konva.Line({
                points: [xPos, 0, xPos, deviceHeight],
                stroke: colors.stroke,
                strokeWidth: 1,
                listening: false,
            }));
        }

        for (let i = 0; i < numSlots; i++) {
            const slotRect = new Konva.Rect({
                x: i * slotWidth,
                y: 0,
                width: slotWidth,
                height: deviceHeight,
                fill: 'transparent',
                listening: true,
                name: 'shelf-slot',
            });
            slotRect.setAttr('slotIndex', i);

            slotRect.on('mouseenter', function () {
                slotRect.fill('rgba(104, 119, 224, 0.08)');
                appState.layer.batchDraw();
            });

            slotRect.on('mouseleave', function () {
                slotRect.fill('transparent');
                appState.layer.batchDraw();
            });

            slotRect.on('click tap', function (event) {
                if (!appState.pendingPlacement) {
                    return;
                }

                event.cancelBubble = true;
                const placed = placePayloadInShelfSlot(appState.pendingPlacement, device, i);
                if (placed && typeof window.clearPendingPlacement === 'function') {
                    window.clearPendingPlacement();
                }
            });

            device.add(slotRect);
        }
    } else {
        const dropZone = new Konva.Rect({
            x: 0,
            y: 0,
            width: rackInnerWidth,
            height: deviceHeight,
            fill: 'transparent',
            listening: true,
            name: 'shelf-drop-zone',
        });

        dropZone.on('mouseenter', function () {
            dropZone.fill('rgba(104, 119, 224, 0.08)');
            appState.layer.batchDraw();
        });

        dropZone.on('mouseleave', function () {
            dropZone.fill('transparent');
            appState.layer.batchDraw();
        });

        dropZone.on('click tap', function (event) {
            if (!appState.pendingPlacement) {
                return;
            }

            event.cancelBubble = true;
            const placed = placePayloadInBlinderShelf(appState.pendingPlacement, device);
            if (placed && typeof window.clearPendingPlacement === 'function') {
                window.clearPendingPlacement();
            }
        });

        device.add(dropZone);
    }

    device.on('click tap', function (event) {
        event.cancelBubble = true;
        selectNode(device);
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
        appState.layer.batchDraw();
        refreshSchemaElementStats();
    });

    attachTooltip(device);

    return device;
}

// Create one draggable device node.
function createDevice(displayUnits, elementName, customColor, customFontColor, deviceComment) {
    const reservedUnits = getReservedUnits(displayUnits);
    const deviceHeight = reservedUnits * unitHeight;
    const defaultName = elementName || `Device ${displayUnits}U`;

    let deviceWidth = rackInnerWidth;
    if (displayUnits === 3) {
        deviceWidth = rackInnerWidth / 6;
    } else if (displayUnits === 4) {
        deviceWidth = rackInnerWidth / 4;
    }

    const colorSchemes = {
        1: { fill: '#FED7D7', stroke: '#FC8181', text: '#742A2A' },
        2: { fill: '#C6F6D5', stroke: '#68D391', text: '#22543D' },
        3: { fill: '#FEEBC8', stroke: '#F6AD55', text: '#7C2D12' },
        4: { fill: '#BEE3F8', stroke: '#63B3ED', text: '#2C5282' },
    };

    let colors = colorSchemes[displayUnits] || colorSchemes[4];

    if (customColor) {
        colors = generateColorScheme(customColor, customFontColor);
    }

    const device = new Konva.Group({
        x: 0,
        y: 0,
        draggable: false,
        name: 'device rack-element',
    });

    device.setAttrs({
        units: reservedUnits,
        displayUnits,
        deviceHeight,
        deviceWidth,
        deviceName: defaultName,
        deviceComment: deviceComment || '',
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

    device.add(body);

    if (displayUnits === 3 || displayUnits === 4) {
        const splitY = Math.round(deviceHeight / 2);

        const divider = new Konva.Line({
            points: [0, splitY, deviceWidth, splitY],
            stroke: colors.stroke,
            strokeWidth: 1,
            listening: false,
            name: 'device-divider',
        });

        const topLabel = new Konva.Text({
            x: 3,
            y: 0,
            width: deviceWidth - 6,
            height: splitY,
            text: defaultName,
            fontSize: Math.max(8, Math.min(13, splitY - 2)),
            fill: colors.text,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontStyle: '600',
            verticalAlign: 'middle',
            align: 'center',
            wrap: 'none',
            ellipsis: true,
            listening: false,
            name: 'device-name-label',
        });

        const bottomLabel = new Konva.Text({
            x: 3,
            y: splitY,
            width: deviceWidth - 6,
            height: deviceHeight - splitY,
            text: deviceComment || '',
            fontSize: Math.max(7, Math.min(12, (deviceHeight - splitY) - 2)),
            fill: colors.text,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontStyle: '400',
            verticalAlign: 'middle',
            align: 'center',
            wrap: 'word',
            listening: false,
            name: 'device-comment-label',
        });

        device.add(divider);
        device.add(topLabel);
        device.add(bottomLabel);
    } else {
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

        device.add(label);
    }

    device.on('click tap', function (event) {
        event.cancelBubble = true;
        selectNode(device);
    });

    device.on('dblclick dbltap', function () {
        selectNode(device);
        const currentName = device.getAttr('deviceName');
        const isSplitDevice = displayUnits === 3 || displayUnits === 4;
        const nextName = window.prompt('Edit device name:', currentName);

        if (nextName === null) {
            return;
        }

        const cleanName = nextName.trim() || currentName;
        const currentComment = device.getAttr('deviceComment') || '';
        let cleanComment = currentComment;

        if (isSplitDevice) {
            const nextComment = window.prompt('Edit device comment:', currentComment);
            if (nextComment === null) {
                return;
            }
            cleanComment = nextComment.trim();
        }

        const textNode = device.findOne('.device-name-label') || device.findOne('.device-label');
        const commentNode = device.findOne('.device-comment-label');
        device.setAttr('deviceName', cleanName);
        device.setAttr('deviceComment', cleanComment);
        textNode.text(cleanName);
        if (commentNode) {
            commentNode.text(cleanComment);
        }
        appState.layer.batchDraw();
        refreshSchemaElementStats();
    });

    attachTooltip(device);

    return device;
}

// Add a device into a target rack.
function addDeviceToRack(displayUnits, rack, dropPoint, elementName, customColor, customFontColor, shelfType, useDropPoint) {
    let device;
    let reservedUnits;

    if (shelfType) {
        device = createShelf(shelfType, elementName);
        reservedUnits = device.getAttr('units');
    } else {
        reservedUnits = getReservedUnits(displayUnits);
        device = createDevice(displayUnits, elementName, customColor, customFontColor);
    }

    let placed = false;

    if (useDropPoint && dropPoint) {
        const preferredStartUnit = getPreferredStartUnit(device, rack, dropPoint);
        if (isUnitRangeFree(rack, preferredStartUnit, reservedUnits, null)) {
            placeElementAtStartUnit(device, rack, preferredStartUnit);
            placed = true;
        }
    }

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

    appState.layer.batchDraw();
    refreshSchemaElementStats();
}

// Build unit grid + side labels for one rack.
function addRackUnitGrid(rack) {
    for (let i = 0; i < rackUnits; i++) {
        const unitNumber = rackUnits - i;
        
        const hoverRect = new Konva.Rect({
            x: cabinetPadding,
            y: cabinetPadding + (i * unitHeight),
            width: rackInnerWidth,
            height: unitHeight,
            fill: 'transparent',
            listening: true,
            name: 'unit-hover',
        });
        hoverRect.setAttr('startUnit', i);
        hoverRect.setAttr('unitNumber', unitNumber);

        hoverRect.on('mouseenter', function () {
            hoverRect.fill('rgba(104, 119, 224, 0.08)');
            appState.layer.batchDraw();
        });

        hoverRect.on('mouseleave', function () {
            hoverRect.fill('transparent');
            appState.layer.batchDraw();
        });

        hoverRect.on('click tap', function (event) {
            if (!appState.pendingPlacement) {
                return;
            }

            event.cancelBubble = true;
            const placed = placePayloadAtRackUnit(appState.pendingPlacement, rack, i);
            if (placed && typeof window.clearPendingPlacement === 'function') {
                window.clearPendingPlacement();
            }
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
        draggable: false,
        name: 'rack',
    });

    rack.setAttr('rackId', `rack-${++appState.rackCounter}`);
    rack.setAttr('rackName', rackName);

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

    rack.add(new Konva.Rect({
        x: cabinetPadding + rackInnerWidth,
        y: cabinetPadding,
        width: rackSideLabelWidth,
        height: rackHeight,
        fill: '#F7FAFC',
        listening: false,
    }));

    rack.add(new Konva.Line({
        points: [cabinetPadding + rackInnerWidth, cabinetPadding, cabinetPadding + rackInnerWidth, cabinetPadding + rackHeight],
        stroke: '#E2E8F0',
        strokeWidth: 1,
        listening: false,
    }));

    addRackUnitGrid(rack);

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
        appState.layer.batchDraw();
        refreshSchemaElementStats();
    });

    appState.layer.add(rack);
    appState.layer.batchDraw();
    refreshSchemaElementStats();
    return rack;
}

// Add a new rack at the next auto-position.
function addRack() {
    const rackName = `Rack ${appState.nextRackNameNumber}`;
    appState.nextRackNameNumber += 1;

    const rackIndex = appState.layer.find('.rack').length;
    const x = 20 + (rackIndex * (cabinetWidth + rackGap));
    const wrappedX = x > (appState.stage.width() - cabinetWidth) ? 20 : x;
    const y = x > (appState.stage.width() - cabinetWidth) ? 70 : 20;

    createRack(wrappedX, y, rackName);
    if (typeof window.saveAutoSaveSilently === 'function') {
        window.saveAutoSaveSilently();
    }
}
