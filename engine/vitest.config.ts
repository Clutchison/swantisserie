// Caps vitest's workers for the shared dev machine, as the other
// workspaces' configs do.
export default { test: { maxWorkers: 4 } };
