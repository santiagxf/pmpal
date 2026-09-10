/**
 * Module resolution hook: redirect the Copilot SDK to scripts/sdk-stub.mjs.
 *
 * Registered by validate.mjs before it imports extension.mjs, so the extension
 * itself needs no test-only branches -- it imports the real specifier and gets
 * the stub.
 */

const STUB = new URL("./sdk-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "@github/copilot-sdk/extension" || specifier === "@github/copilot-sdk") {
    return { url: STUB, shortCircuit: true, format: "module" };
  }
  return next(specifier, context);
}
