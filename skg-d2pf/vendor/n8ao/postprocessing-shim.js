// Minimal stand-in for the `postprocessing` package so vendor/n8ao/N8AO.js can be imported without
// shipping postprocessing (~330 KB). Only N8AOPostPass extends this class; we use N8AOPass (three's Pass).
export class Pass { constructor(name = 'Pass') { this.name = name; this.enabled = true; this.needsSwap = true; this.renderToScreen = false; } setSize() {} dispose() {} }
