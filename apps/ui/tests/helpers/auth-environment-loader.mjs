// Framework boundaries are provided by Next.js in production. Each Node test file
// runs in its own process; these modules access only that test's injected context.
export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only")
    return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier === "next/headers") {
    return {
      url: "data:text/javascript,export async function cookies(){return globalThis.__authTestContext.cookies();}",
      shortCircuit: true,
    };
  }
  if (specifier === "next-intl/server") {
    return {
      url: "data:text/javascript,export async function getLocale(){return globalThis.__authTestContext.locale;} export async function getTranslations(){return globalThis.__authTestContext.translator;}",
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
