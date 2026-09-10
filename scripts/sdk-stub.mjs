/**
 * A stand-in for `@github/copilot-sdk/extension`, substituted by stub-loader.mjs
 * during validation.
 *
 * The real `joinSession()` throws unless the process was forked by the Copilot
 * CLI, which is why a plain `node extension.mjs` can never get past line one of
 * useful work. Swapping it out lets the validator load the extension exactly as
 * the host would, then inspect what it registered.
 */

const registry = (globalThis.__pmpalValidation ??= {
  canvases: [],
  sessionOptions: [],
  logs: [],
  sends: [],
});

export class CanvasError extends Error {}
export class FactoryResumeError extends Error {}

export function createCanvas(spec) {
  registry.canvases.push(spec);
  return { ...spec, __stub: true };
}

export async function joinSession(options = {}) {
  registry.sessionOptions.push(options);
  return {
    log: (msg) => registry.logs.push(String(msg)),
    send: (payload) => registry.sends.push(payload),
    close: async () => {},
  };
}

export function defineFactory(f) {
  return f;
}

export function isFactoryRunTerminal() {
  return false;
}

export const Canvas = class Canvas {};
