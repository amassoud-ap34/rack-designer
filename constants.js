// Rack and Cabinet Constants
// All dimensions follow real-world scaling: 5 pixels = 1 cm

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

// Toolbar width when pinned.
const toolbarWidth = 240;
