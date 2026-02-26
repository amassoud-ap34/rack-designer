// Rack Creation and Device Placement Logic
// Depends on: constants.js, utils.js, and app state variables (stage, layer, tooltipLayer, etc.)

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

// Create a shelf device with internal slots (vertical dividers).
function createShelf(shelfType, elementName) {
    const shelfConfigs = {
        '3u-4': { displayUnits: 3, numSlots: 4, name: 'Shelf 3U (4 slots)' },
        '3u-6': { displayUnits: 3, numSlots: 6, name: 'Shelf 3U (6 slots)' },
        '6u-3': { displayUnits: 4, numSlots: 3, name: 'Shelf 6U (3 slots)' },
        '6u-4': { displayUnits: 4, numSlots: 4, name: 'Shelf 6U (4 slots)' },
    };

    const config = shelfConfigs[shelfType];
    const { displayUnits, numSlots } = config;
    const shelfName = elementName || config.name;
    const reservedUnits = getReservedUnits(displayUnits);
    const deviceHeight = reservedUnits * unitHeight;
    const slotWidth = rackInnerWidth / numSlots;

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
        appState.layer.batchDraw();
    });

    // Throttle dragmove for better performance
    let dragMoveFrame;
    device.on('dragmove', function () {
        if (dragMoveFrame) return;
        dragMoveFrame = requestAnimationFrame(() => {
            device.position({
                x: clamp(device.x(), 0, appState.stage.width() - rackInnerWidth),
                y: clamp(device.y(), 0, appState.stage.height() - device.getAttr('deviceHeight')),
            });
            dragMoveFrame = null;
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

        appState.layer.batchDraw();
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
    });

    attachTooltip(device);

    return device;
}

// Create one draggable device node.
function createDevice(displayUnits, elementName, customColor, customFontColor) {
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

        releaseShelfSlotForDevice(device);

        const absolutePos = device.getAbsolutePosition();
        device.moveTo(layer);
        device.position(absolutePos);
        appState.layer.batchDraw();
    });

    // Throttle dragmove for better performance
    let dragMoveFrame;
    device.on('dragmove', function () {
        if (dragMoveFrame) return;
        dragMoveFrame = requestAnimationFrame(() => {
            const deviceWidth = getDeviceWidth(device);
            device.position({
                x: clamp(device.x(), 0, appState.stage.width() - deviceWidth),
                y: clamp(device.y(), 0, appState.stage.height() - device.getAttr('deviceHeight')),
            });
            dragMoveFrame = null;
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

        appState.layer.batchDraw();
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
        appState.layer.batchDraw();
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

        hoverRect.on('mouseenter', function () {
            hoverRect.fill('rgba(104, 119, 224, 0.08)');
            appState.layer.batchDraw();
        });

        hoverRect.on('mouseleave', function () {
            hoverRect.fill('transparent');
            appState.layer.batchDraw();
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

    // Throttle rack dragmove for better performance
    let rackDragFrame;
    rack.on('dragmove', function () {
        if (rackDragFrame) return;
        rackDragFrame = requestAnimationFrame(() => {
            rack.position({
                x: clamp(rack.x(), 0, appState.stage.width() - cabinetWidth),
                y: clamp(rack.y(), 0, appState.stage.height() - cabinetHeight),
            });
            rackDragFrame = null;
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
        appState.layer.batchDraw();
    });

    appState.layer.add(rack);
    appState.layer.batchDraw();
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
}
