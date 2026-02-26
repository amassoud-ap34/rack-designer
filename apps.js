// Main Application - UI State and Event Handling
// Depends on: constants.js, utils.js, rack-logic.js, project-manager.js

// Global app state - accessible to all modules
let appState = {
    stage: null,
    layer: null,
    backgroundLayer: null,
    tooltipLayer: null,
    tooltip: null,
    watermark: null,
    rackCounter: 0,
    nextRackNameNumber: 1,
    selectedNode: null,
    isToolbarPinned: true,
    isToolbarCollapsed: false,
    colorPickerCallback: null,
    autoSaveInterval: null,
    currentProjectFilename: null,
    currentProjectFileHandle: null,
    pendingPlacement: null,
    pendingPaletteNode: null,
};

// Run the app only after the HTML is fully loaded.
document.addEventListener('DOMContentLoaded', function () {
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
    // Toolbar resize handle.
    const toolbarResizeHandle = document.getElementById('toolbarResizeHandle');
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
    // Toolbar profile export/import buttons.
    const exportToolbarProfileBtn = document.getElementById('exportToolbarProfileBtn');
    const importToolbarProfileBtn = document.getElementById('importToolbarProfileBtn');
    const toolbarProfileFileInput = document.getElementById('toolbarProfileFileInput');
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

    // Create Konva stage on the container.
    appState.stage = new Konva.Stage({
        // DOM container id.
        container: 'container',
        // Initial stage width from container.
        width: container.clientWidth,
        // Initial stage height from container.
        height: container.clientHeight,
    });

    // Create background layer with watermark.
    appState.backgroundLayer = new Konva.Layer({ listening: false });
    appState.stage.add(appState.backgroundLayer);

    appState.watermark = new Konva.Text({
        text: 'rack-designer',
        fontSize: 120,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontStyle: 'bold',
        fill: '#9CA3AF',
        opacity: 0.3,
        listening: false,
    });

    // Center watermark horizontally and position higher vertically.
    appState.watermark.position({
        x: (appState.stage.width() - appState.watermark.width()) / 2,
        y: (appState.stage.height() - appState.watermark.height()) / 2 - 100,
    });

    appState.backgroundLayer.add(appState.watermark);

    // Create one layer for all drawable shapes.
    appState.layer = new Konva.Layer();
    // Add the layer into stage.
    appState.stage.add(appState.layer);

    // Create tooltip layer that sits above everything else.
    appState.tooltipLayer = new Konva.Layer({ listening: false });
    appState.stage.add(appState.tooltipLayer);

    appState.tooltip = new Konva.Label({
        opacity: 0,
        listening: false,
    });

    appState.tooltip.add(new Konva.Tag({
        fill: '#2D3748',
        pointerDirection: 'down',
        pointerWidth: 6,
        pointerHeight: 4,
        cornerRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.2)',
        shadowBlur: 4,
        shadowOffset: { x: 0, y: 2 },
    }));

    appState.tooltip.add(new Konva.Text({
        text: '',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: 11,
        padding: 6,
        fill: '#FFFFFF',
    }));

    appState.tooltipLayer.add(appState.tooltip);
    
    // Make global references for easier access using appState
    // (All state is stored in appState object for cross-module access)

    // Set up local function shortcuts that use appState
    function attachTooltip(node) {
        node.on('mouseenter', function () {
            const name = node.getAttr('deviceName');
            const mousePos = appState.stage.getPointerPosition();
            if (mousePos) {
                appState.tooltip.getText().text(name);
                appState.tooltip.position({ x: mousePos.x, y: mousePos.y - 10 });
                appState.tooltip.opacity(0.95);
                requestAnimationFrame(() => appState.tooltipLayer.batchDraw());
            }
        });
        node.on('mouseleave', function () {
            appState.tooltip.opacity(0);
            requestAnimationFrame(() => appState.tooltipLayer.batchDraw());
        });
    }

    // Resize workspace so full rack height is always reachable by scroll.
    function resizeWorkspace() {
        requestAnimationFrame(() => {
            const container = document.getElementById('container');
            const viewportHeight = window.innerHeight;
            const minWorkspaceHeight = Math.ceil(rackHeight + (unitHeight * 2));
            const workspaceHeight = Math.max(viewportHeight, minWorkspaceHeight);

            container.style.height = `${workspaceHeight}px`;
            appState.stage.size({
                width: container.clientWidth,
                height: workspaceHeight,
            });
            
            // Update watermark position on resize.
            appState.watermark.position({
                x: (appState.stage.width() - appState.watermark.width()) / 2,
                y: (appState.stage.height() - appState.watermark.height()) / 2 - 100,
            });
            
            appState.backgroundLayer.batchDraw();
            appState.layer.batchDraw();
        });
    }

    // Sync toolbar classes, aria states, and workspace sizing.
    function syncToolbarState() {
        const toolbar = document.getElementById('toolbar');
        const toggleToolbarBtn = document.getElementById('toggleToolbarBtn');
        const pinToolbarBtn = document.getElementById('pinToolbarBtn');
        const toolbarBody = document.getElementById('toolbarBody');
        
        toolbar.classList.toggle('collapsed', appState.isToolbarCollapsed);
        toolbar.classList.toggle('pinned', appState.isToolbarPinned);
        toolbar.classList.toggle('unpinned', !appState.isToolbarPinned);
        document.body.classList.toggle('toolbar-pinned', appState.isToolbarPinned);

        toggleToolbarBtn.textContent = appState.isToolbarCollapsed ? '▶' : '◀';
        toggleToolbarBtn.setAttribute('aria-expanded', String(!appState.isToolbarCollapsed));
        pinToolbarBtn.setAttribute('aria-pressed', String(appState.isToolbarPinned));
        toolbarBody.hidden = appState.isToolbarCollapsed;

        resizeWorkspace();
    }

    // Enable/disable delete button depending on selection.
    function updateDeleteButtonState() {
        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        deleteSelectedBtn.disabled = !appState.selectedNode;
    }

    // Remove highlight from selected node.
    function clearSelection() {
        if (!appState.selectedNode) {
            updateDeleteButtonState();
            return;
        }

        if (appState.selectedNode.hasName('rack')) {
            applyBorder(appState.selectedNode, '.rack-frame', '#000000', 2);
        }
        if (appState.selectedNode.hasName('device')) {
            applyBorder(appState.selectedNode, '.device-body','#4a77a8', 1);
        }

        appState.selectedNode = null;
        updateDeleteButtonState();
        appState.layer.batchDraw();
    }

    // Switch selection to one node.
    function selectNode(node) {
        if (appState.selectedNode === node) {
            return;
        }

        clearSelection();
        appState.selectedNode = node;
        updateDeleteButtonState();

        if (node.hasName('rack')) {
            applyBorder(node, '.rack-frame', '#3182CE', 3);
        }
        if (node.hasName('device')) {
            applyBorder(node, '.device-body', '#3182CE', 2);
        }

        appState.layer.batchDraw();
    }

    // Delete the selected rack or device node.
    function deleteSelectedNode() {
        if (!appState.selectedNode) {
            return;
        }

        releaseShelfSlotForDevice(appState.selectedNode);
        appState.selectedNode.destroy();
        appState.selectedNode = null;
        updateDeleteButtonState();
        appState.layer.batchDraw();
        if (typeof saveAutoSaveSilently === 'function') {
            saveAutoSaveSilently();
        }
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

    // Storage key for shelf palette by group (shelf-3u, shelf-6u).
    function getShelfStorageKey(groupUnits) {
        return `rack-designer-shelves-${groupUnits}`;
    }

    function getShelfDeletedStorageKey(groupUnits) {
        return `rack-designer-shelves-deleted-${groupUnits}`;
    }

    function getShelfItemKey(item) {
        return `${item.shelfType}::${item.name}`;
    }

    // Save shelf elements currently in one shelf group list.
    function saveShelfElements(groupUnits, elementList) {
        const items = Array.from(elementList.querySelectorAll('.palette-element')).map((node) => ({
            name: node.querySelector('.device-name')?.textContent?.trim() || '',
            shelfType: node.dataset.shelfType || '',
        })).filter((item) => item.name && item.shelfType);

        localStorage.setItem(getShelfStorageKey(groupUnits), JSON.stringify(items));
    }

    // Load saved shelf elements for one shelf group.
    function loadShelfElements(groupUnits) {
        const stored = localStorage.getItem(getShelfStorageKey(groupUnits));
        return stored ? JSON.parse(stored) : null;
    }

    function loadDeletedShelfElements(groupUnits) {
        const stored = localStorage.getItem(getShelfDeletedStorageKey(groupUnits));
        return stored ? JSON.parse(stored) : [];
    }

    function saveDeletedShelfElements(groupUnits, deletedList) {
        localStorage.setItem(getShelfDeletedStorageKey(groupUnits), JSON.stringify(deletedList));
    }

    function getShelfItemsFromDom(groupUnits) {
        const group = document.querySelector(`.device-group[data-units="${groupUnits}"]`);
        if (!group) {
            return [];
        }

        const list = group.querySelector('.element-list');
        if (!list) {
            return [];
        }

        return Array.from(list.querySelectorAll('.palette-element')).map((node) => ({
            name: node.querySelector('.device-name')?.textContent?.trim() || '',
            shelfType: node.dataset.shelfType || '',
        })).filter((item) => item.name && item.shelfType);
    }

    function buildToolbarProfile() {
        const profile = {
            version: 1,
            exportedAt: new Date().toISOString(),
            customDevices: {
                '1U': loadCustomDevices(1),
                '2U': loadCustomDevices(2),
                '3U': loadCustomDevices(3),
                '4U': loadCustomDevices(4),
            },
            shelves: {
                'shelf-3u': {
                    items: loadShelfElements('shelf-3u') || getShelfItemsFromDom('shelf-3u'),
                    deleted: loadDeletedShelfElements('shelf-3u'),
                },
                'shelf-6u': {
                    items: loadShelfElements('shelf-6u') || getShelfItemsFromDom('shelf-6u'),
                    deleted: loadDeletedShelfElements('shelf-6u'),
                },
            },
        };

        return profile;
    }

    function exportToolbarProfile() {
        const profile = buildToolbarProfile();
        const json = JSON.stringify(profile, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        triggerDownload(url, `toolbar-profile-${timestamp}.json`);
        URL.revokeObjectURL(url);
    }

    function applyToolbarProfile(profile) {
        if (!profile || typeof profile !== 'object') {
            throw new Error('Invalid profile data.');
        }

        const deviceMap = [
            { key: '1U', units: 1 },
            { key: '2U', units: 2 },
            { key: '3U', units: 3 },
            { key: '4U', units: 4 },
        ];

        deviceMap.forEach(({ key, units }) => {
            const list = profile.customDevices && Array.isArray(profile.customDevices[key])
                ? profile.customDevices[key]
                : [];
            saveCustomDevices(units, list);
        });

        ['shelf-3u', 'shelf-6u'].forEach((groupUnits) => {
            const shelfGroup = profile.shelves && profile.shelves[groupUnits] ? profile.shelves[groupUnits] : {};
            const items = Array.isArray(shelfGroup.items) ? shelfGroup.items : [];
            const deleted = Array.isArray(shelfGroup.deleted) ? shelfGroup.deleted : [];
            localStorage.setItem(getShelfStorageKey(groupUnits), JSON.stringify(items));
            localStorage.setItem(getShelfDeletedStorageKey(groupUnits), JSON.stringify(deleted));
        });
    }

    function importToolbarProfileFromFile(file) {
        if (!file) {
            return;
        }

        if (!file.name.toLowerCase().endsWith('.json')) {
            window.alert('Please select a valid .json toolbar profile file.');
            return;
        }

        const reader = new FileReader();
        reader.onerror = function () {
            window.alert('Could not read the selected toolbar profile file.');
        };
        reader.onload = function () {
            try {
                const raw = String(reader.result || '').replace(/^\uFEFF/, '');
                const parsed = JSON.parse(raw);
                applyToolbarProfile(parsed);
                window.alert('Toolbar profile imported successfully. The page will reload now.');
                window.location.reload();
            } catch (error) {
                window.alert('Could not import toolbar profile. Please use a profile exported from this app.');
            }
        };
        reader.readAsText(file);
    }

    function clearPendingPlacement() {
        appState.pendingPlacement = null;
        if (appState.pendingPaletteNode) {
            appState.pendingPaletteNode.classList.remove('placement-selected');
            appState.pendingPaletteNode = null;
        }
    }

    function getPalettePayload(elementNode) {
        return {
            units: parseInt(elementNode.dataset.units, 10) || elementNode.dataset.units,
            name: elementNode.querySelector('.device-name')?.textContent?.trim() || elementNode.textContent.trim(),
            color: elementNode.dataset.color || null,
            fontColor: elementNode.dataset.fontColor || null,
            shelfType: elementNode.dataset.shelfType || null,
        };
    }

    // Attach click-to-select behavior to one palette element item.
    function attachElementDragBehavior(elementNode) {
        elementNode.setAttribute('draggable', 'false');
        elementNode.addEventListener('click', function (event) {
            if (event.target.classList && (event.target.classList.contains('delete-device-btn') || event.target.classList.contains('edit-device-btn'))) {
                return;
            }

            if (appState.pendingPaletteNode === elementNode) {
                clearPendingPlacement();
                return;
            }

            clearPendingPlacement();
            appState.pendingPlacement = getPalettePayload(elementNode);
            appState.pendingPaletteNode = elementNode;
            elementNode.classList.add('placement-selected');
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

                    nameSpan.textContent = cleanName;
                    newEntry.dataset.color = newBgColor;
                    newEntry.dataset.fontColor = newFontColor;
                    newEntry.style.background = newBgColor;
                    newEntry.style.color = newFontColor;

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

    // Create one shelf palette element with delete button (user-controlled deletion).
    function createShelfPaletteElement(name, groupUnits, shelfType) {
        const newEntry = document.createElement('div');
        newEntry.className = 'palette-element';
        newEntry.dataset.units = groupUnits;
        newEntry.dataset.shelfType = shelfType;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'device-name';
        nameSpan.textContent = name;
        newEntry.appendChild(nameSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-device-btn';
        deleteBtn.type = 'button';
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete this shelf';

        deleteBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            const list = newEntry.parentElement;
            const deleted = loadDeletedShelfElements(groupUnits);
            const deletedKey = getShelfItemKey({ name, shelfType });
            if (!deleted.includes(deletedKey)) {
                deleted.push(deletedKey);
                saveDeletedShelfElements(groupUnits, deleted);
            }
            newEntry.remove();
            if (list) {
                saveShelfElements(groupUnits, list);
            }
        });

        newEntry.appendChild(deleteBtn);
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

            if (isShelfGroup) {
                const savedShelfElements = loadShelfElements(displayUnits);
                const deletedShelfKeys = new Set(loadDeletedShelfElements(displayUnits));
                const defaults = Array.from(elementList.querySelectorAll('.palette-element')).map((element) => ({
                    name: element.querySelector('.device-name')?.textContent?.trim() || '',
                    shelfType: element.dataset.shelfType || '',
                })).filter((item) => item.name && item.shelfType);

                const visibleDefaults = defaults.filter((item) => !deletedShelfKeys.has(getShelfItemKey(item)));
                const merged = [];
                const seen = new Set();

                if (Array.isArray(savedShelfElements)) {
                    savedShelfElements.forEach((item) => {
                        if (!item || !item.name || !item.shelfType) {
                            return;
                        }
                        const key = getShelfItemKey(item);
                        if (deletedShelfKeys.has(key) || seen.has(key)) {
                            return;
                        }
                        seen.add(key);
                        merged.push(item);
                    });
                }

                visibleDefaults.forEach((item) => {
                    const key = getShelfItemKey(item);
                    if (!seen.has(key)) {
                        seen.add(key);
                        merged.push(item);
                    }
                });

                elementList.innerHTML = '';
                merged.forEach((item) => {
                    const entry = createShelfPaletteElement(item.name, displayUnits, item.shelfType);
                    elementList.appendChild(entry);
                });
                saveShelfElements(displayUnits, elementList);
                return;
            }

            const nameInput = group.querySelector('.new-element-name');
            const colorPickerBtn = group.querySelector('.color-picker-btn');
            const addBtn = group.querySelector('.add-element-btn');
            const displayUnitsInt = parseInt(displayUnits, 10);

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

            const customDevices = loadCustomDevices(displayUnitsInt);
            customDevices.forEach((device) => {
                const deviceName = typeof device === 'string' ? device : device.name;
                const deviceColor = typeof device === 'string' ? null : device.color;
                const deviceFontColor = typeof device === 'string' ? null : device.fontColor;
                const entry = createPaletteElement(deviceName, displayUnitsInt, deviceColor, deviceFontColor, true);
                elementList.appendChild(entry);
            });
        });
    }

    // Show color picker modal with callback.
    function showColorPicker(bgColor, fontColor, callback) {
        bgColorInput.value = bgColor;
        fontColorInput.value = fontColor;
        appState.colorPickerCallback = callback;
        toggleModal(colorPickerModal, true);
    }

    // Hide color picker modal.
    function hideColorPicker() {
        toggleModal(colorPickerModal, false);
        appState.colorPickerCallback = null;
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
                    loadProject(data, file.name);
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
            if (appState.colorPickerCallback) {
                appState.colorPickerCallback(bgColorInput.value, fontColorInput.value);
            }
            hideColorPicker();
        });

        cancelColorBtn.addEventListener('click', function () {
            hideColorPicker();
        });
    }

    // Download the current canvas as a PNG file.
    function downloadRackAsPng() {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `rack-designer-${timestamp}.png`;
        const dataURL = appState.stage.toDataURL({ pixelRatio: 2 });
        triggerDownload(dataURL, filename);
    }

    // --- Toolbar behavior ---

    // Toolbar resize functionality
    let isResizing = false;
    let resizeStartX = 0;
    let resizeStartWidth = 0;

    toolbarResizeHandle.addEventListener('mousedown', function (e) {
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartWidth = toolbar.offsetWidth;
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;
        const deltaX = e.clientX - resizeStartX;
        const newWidth = Math.max(180, Math.min(500, resizeStartWidth + deltaX));
        toolbar.style.width = newWidth + 'px';
        if (appState.isToolbarPinned) {
            document.documentElement.style.setProperty('--toolbar-width', newWidth + 'px');
            resizeWorkspace();
        }
    });

    document.addEventListener('mouseup', function () {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });

    toggleToolbarBtn.addEventListener('click', function () {
        appState.isToolbarCollapsed = !appState.isToolbarCollapsed;
        syncToolbarState();
    });

    pinToolbarBtn.addEventListener('click', function () {
        appState.isToolbarPinned = !appState.isToolbarPinned;
        appState.isToolbarCollapsed = !appState.isToolbarPinned;
        syncToolbarState();
    });

    toolbar.addEventListener('mouseenter', function () {
        if (!appState.isToolbarPinned) {
            appState.isToolbarCollapsed = false;
            syncToolbarState();
        }
    });

    toolbar.addEventListener('mouseleave', function () {
        if (!appState.isToolbarPinned) {
            appState.isToolbarCollapsed = true;
            syncToolbarState();
        }
    });

    addRackBtn.addEventListener('click', addRack);
    deleteSelectedBtn.addEventListener('click', deleteSelectedNode);
    downloadPngBtn.addEventListener('click', downloadRackAsPng);
    saveProjectBtn.addEventListener('click', saveProject);
    exportToolbarProfileBtn.addEventListener('click', exportToolbarProfile);
    importToolbarProfileBtn.addEventListener('click', function () {
        toolbarProfileFileInput.value = '';
        toolbarProfileFileInput.click();
    });
    toolbarProfileFileInput.addEventListener('change', function (event) {
        const file = event.target.files && event.target.files[0];
        importToolbarProfileFromFile(file);
    });
    
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

    // --- Click-to-place from palette to canvas ---

    // --- Global events ---

    // Debounced resize handler for better performance
    const debouncedResize = debounce(resizeWorkspace, 150);
    window.addEventListener('resize', debouncedResize);

    appState.stage.on('click tap', function (event) {
        if (appState.pendingPlacement && event.target && event.target.hasName && event.target.hasName('unit-hover')) {
            const rack = event.target.getParent();
            const startUnit = event.target.getAttr('startUnit');
            const placed = placePayloadAtRackUnit(appState.pendingPlacement, rack, startUnit);
            if (placed) {
                clearPendingPlacement();
            }
            return;
        }

        if (appState.pendingPlacement && event.target && event.target.hasName && event.target.hasName('shelf-slot')) {
            const shelf = event.target.getParent();
            const slotIndex = event.target.getAttr('slotIndex');
            const placed = placePayloadInShelfSlot(appState.pendingPlacement, shelf, slotIndex);
            if (placed) {
                clearPendingPlacement();
            }
            return;
        }

        if (event.target === appState.stage) {
            clearPendingPlacement();
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

        appState.layer.find('.rack').forEach((rack) => {
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

    // Expose critical functions globally so rack-logic.js can use them
    window.selectNode = selectNode;
    window.clearSelection = clearSelection;
    window.clearPendingPlacement = clearPendingPlacement;
    window.attachTooltip = attachTooltip;
    window.updateDeleteButtonState = updateDeleteButtonState;
    window.deleteSelectedNode = deleteSelectedNode;
    
    // Expose project-manager.js functions globally
    window.resetWorkspace = resetWorkspace;
    window.saveProject = saveProject;
    window.saveAutoSaveSilently = saveAutoSaveSilently;
    window.loadProject = loadProject;
    window.startAutoSave = startAutoSave;
    window.checkAutoSaveRecovery = checkAutoSaveRecovery;
    window.showProjectModal = showProjectModal;
    window.hideProjectModal = hideProjectModal;
    
    // Expose rack-logic.js functions globally
    window.addRack = addRack;
    window.getRackAtPoint = getRackAtPoint;
    window.getShelfAtPoint = getShelfAtPoint;
    window.createDevice = createDevice;
    window.createShelf = createShelf;
    window.createRack = createRack;
    window.placeDeviceInShelf = placeDeviceInShelf;
    window.placeDeviceInRack = placeDeviceInRack;
    window.addDeviceToRack = addDeviceToRack;
});
