// Project Management - Save, Load, Auto-save, Serialization
// Depends on: constants.js, utils.js, rack-logic.js, and app state variables

// Reset workspace and clear all racks.
function resetWorkspace() {
    clearSelection();
    appState.layer.destroyChildren();
    appState.rackCounter = 0;
    appState.nextRackNameNumber = 1;
    appState.currentProjectFilename = null;
    appState.layer.batchDraw();
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

    appState.layer.find('.rack').forEach((rack) => {
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
function loadProject(project, filename) {
    if (!project || !Array.isArray(project.racks)) {
        throw new Error('Invalid project data.');
    }

    resetWorkspace();
    
    // Set filename if provided
    if (filename) {
        appState.currentProjectFilename = filename;
    }

    project.racks.forEach((rackData) => {
        const rackName = rackData.rackName || `Rack ${appState.nextRackNameNumber}`;
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

    appState.nextRackNameNumber = appState.layer.find('.rack').length + 1;
    appState.layer.batchDraw();
}

// Save project - if filename exists, save directly; otherwise prompt
function saveProject() {
    if (appState.currentProjectFilename) {
        // Save to existing filename
        downloadProjectFile(appState.currentProjectFilename);
    } else {
        // No filename yet, prompt for one
        saveProjectAs();
    }
}

// Save project with a new filename (always prompts)
function saveProjectAs() {
    const defaultName = appState.currentProjectFilename || 'rack-project';
    const filename = window.prompt('Enter project filename:', defaultName);
    
    if (filename === null) return;
    
    const cleanFilename = filename.trim() || 'rack-project';
    const finalFilename = cleanFilename.endsWith('.json') ? cleanFilename : `${cleanFilename}.json`;
    
    appState.currentProjectFilename = finalFilename;
    downloadProjectFile(finalFilename);
}

// Export current project as a JSON file (with default filename).
function exportProject() {
    downloadProjectFile('rack-project-export.json');
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

// Show/hide project modal.
function showProjectModal() { 
    const projectModal = document.getElementById('projectModal');
    toggleModal(projectModal, true); 
}
function hideProjectModal() { 
    const projectModal = document.getElementById('projectModal');
    toggleModal(projectModal, false); 
}

// Auto-save project to localStorage.
function performAutoSave(options) {
    const silent = Boolean(options && options.silent);
    try {
        const data = serializeProject();
        const json = JSON.stringify(data);
        localStorage.setItem('rack-designer-autosave', json);
        localStorage.setItem('rack-designer-autosave-timestamp', new Date().toISOString());
        sessionStorage.setItem('rack-designer-autosave', json);
        
        // Show save confirmation briefly.
        const autoSaveText = document.getElementById('autoSaveText');
        const autoSaveStatus = document.getElementById('autoSaveStatus');
        if (!silent && autoSaveText) {
            const now = new Date();
            autoSaveText.textContent = `Auto-saved at ${now.toLocaleTimeString()}`;
            autoSaveStatus.style.color = '#48BB78';
            setTimeout(function () {
                autoSaveStatus.style.color = '#718096';
            }, 2000);
        }
    } catch (error) {
        console.warn('Auto-save failed:', error);
        const autoSaveText = document.getElementById('autoSaveText');
        const autoSaveStatus = document.getElementById('autoSaveStatus');
        if (!silent && autoSaveText) {
            autoSaveText.textContent = 'Auto-save failed';
            autoSaveStatus.style.color = '#E53E3E';
        }
    }
}

// Save autosave data without touching the UI (used on unload).
function saveAutoSaveSilently() {
    performAutoSave({ silent: true });
}

// Start auto-save timer (saves every 10 seconds).
function startAutoSave() {
    if (appState.autoSaveInterval) {
        clearInterval(appState.autoSaveInterval);
    }
    appState.autoSaveInterval = setInterval(performAutoSave, 10000); // 10 seconds
    
    // Show auto-save status.
    const autoSaveStatus = document.getElementById('autoSaveStatus');
    const autoSaveText = document.getElementById('autoSaveText');
    if (autoSaveStatus) {
        autoSaveStatus.style.display = 'block';
        autoSaveText.textContent = 'Auto-save enabled';
    }
    
    // Perform initial auto-save.
    performAutoSave();
}

// Stop auto-save timer.
function stopAutoSave() {
    if (appState.autoSaveInterval) {
        clearInterval(appState.autoSaveInterval);
        appState.autoSaveInterval = null;
    }
}

window.addEventListener('beforeunload', saveAutoSaveSilently);
window.addEventListener('pagehide', saveAutoSaveSilently);
document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
        saveAutoSaveSilently();
    }
});

// Check for auto-saved project and offer recovery.
function checkAutoSaveRecovery() {
    const autosave = sessionStorage.getItem('rack-designer-autosave')
        || localStorage.getItem('rack-designer-autosave');
    if (autosave) {
        try {
            const data = JSON.parse(autosave);
            loadProject(data);
            hideProjectModal();
            startAutoSave();
            return true;
        } catch (error) {
            console.error('Could not recover auto-saved project:', error);
            localStorage.removeItem('rack-designer-autosave');
            localStorage.removeItem('rack-designer-autosave-timestamp');
            sessionStorage.removeItem('rack-designer-autosave');
        }
    }

    return false;
}
