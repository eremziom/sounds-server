import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

function signature(elements, result = new Set()) {
  for (const element of elements) {
    if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
    result.add(`${element.value}:${element.type}${element.type === TYPE.plural ? `:${element.pluralType}` : ""}`);
    if (element.type === TYPE.tag) signature(element.children, result);
    if (element.type === TYPE.select || element.type === TYPE.plural) {
      for (const option of Object.values(element.options)) signature(option.value, result);
    }
  }
  return [...result].sort().join("|");
}

function flatten(tree, locale, errors, prefix = "", result = new Map()) {
  if (!tree || typeof tree !== "object" || Array.isArray(tree) || !Object.keys(tree).length) {
    errors.push(`${locale}:${prefix || "<root>"}: expected a nonempty namespace`);
    return result;
  }
  for (const [name, value] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) errors.push(`${locale}:${key}: invalid key name`);
    if (typeof value === "string") {
      if (!value.trim()) errors.push(`${locale}:${key}: empty message`);
      try {
        const ast = parse(value, { requiresOtherClause: true });
        result.set(key, signature(ast));
      } catch {
        errors.push(`${locale}:${key}: invalid ICU message`);
        result.set(key, null);
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, locale, errors, key, result);
    } else {
      errors.push(`${locale}:${key}: expected a string or namespace`);
    }
  }
  return result;
}

export function validateCatalogs(catalogs, baseLocale = "en") {
  const errors = [];
  const flattened = new Map(Object.entries(catalogs).map(([locale, messages]) => [
    locale, flatten(messages, locale, errors),
  ]));
  const base = flattened.get(baseLocale);
  if (!base) return [...errors, `Missing base locale: ${baseLocale}`];
  for (const [locale, messages] of flattened) {
    if (locale === baseLocale) continue;
    for (const [key, args] of base) {
      if (!messages.has(key)) errors.push(`${locale}:${key}: missing message`);
      else if (args !== null && messages.get(key) !== null && messages.get(key) !== args) {
        errors.push(`${locale}:${key}: ICU arguments or tags differ from ${baseLocale}`);
      }
    }
    for (const key of messages.keys()) {
      if (!base.has(key)) errors.push(`${locale}:${key}: extra message`);
    }
  }
  return errors;
}
