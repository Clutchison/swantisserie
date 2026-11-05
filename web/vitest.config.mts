// Read by `ng test` through angular.json's `runnerConfig`. `ng test` rejects
// vitest's `--maxWorkers` flag, so the worker cap the shared dev machine
// needs lives here instead.
export default { test: { maxWorkers: 4 } };
