/**
 * Snips Renderer — Bootstrap
 *
 * This is the entry point for the main window renderer process.
 * All UI logic is split into dedicated modules:
 *   - state.js    — application state and DOM element references
 *   - icons.js    — SVG icon constants
 *   - toast.js    — toast notification helper
 *   - charts.js   — canvas bar/pie chart rendering
 *   - import.js   — CSV import logic
 *   - render.js   — DOM rendering, data loading, stats, helper status
 *   - events.js   — event wiring and boot sequence
 */
import { boot } from './events.js';

boot();
