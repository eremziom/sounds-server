export type MessageTree = { [key: string]: string | MessageTree };
export type MissingMessage = { locale: string; key: string };

// Diagnostics contain catalog identifiers only, never message values or request data.
export function reportMissingMessage({ locale, key }: MissingMessage) {
  console.warn("[i18n] Missing translation", { locale, key });
}

export function withEnglishFallback(
  english: MessageTree,
  translated: MessageTree,
  locale: string,
  report: (missing: MissingMessage) => void = reportMissingMessage,
  prefix = "",
): MessageTree {
  const result: MessageTree = {};
  for (const [name, value] of Object.entries(english)) {
    const key = prefix ? `${prefix}.${name}` : name;
    const candidate = Object.hasOwn(translated, name) ? translated[name] : undefined;
    if (typeof value === "string") {
      if (typeof candidate === "string" && candidate.trim()) {
        result[name] = candidate;
      } else {
        report({ locale, key });
        result[name] = value;
      }
    } else {
      result[name] = withEnglishFallback(
        value,
        candidate && typeof candidate === "object" ? candidate : {},
        locale,
        report,
        key,
      );
    }
  }
  return result;
}

export function pickNamespaces<T extends MessageTree, K extends keyof T>(
  messages: T,
  namespaces: readonly K[],
): Pick<T, K> {
  return Object.fromEntries(namespaces.map((key) => [key, messages[key]])) as Pick<T, K>;
}
