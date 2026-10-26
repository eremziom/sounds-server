import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import { createTranslator } from "next-intl";
import { locales, isLocale } from "../src/i18n/config.ts";
import { withEnglishFallback, pickNamespaces } from "../src/i18n/catalog.ts";
import { validateCatalogs } from "../scripts/message-validation.mjs";

register("./helpers/server-only-loader.mjs", import.meta.url);
const { loadMessages } = await import("../src/i18n/messages.ts");

test("catalogs are complete and every locale loads its own messages", async () => {
  const catalogs = {};
  for (const locale of locales) {
    catalogs[locale] = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
    assert.deepEqual(await loadMessages(locale), catalogs[locale]);
  }
  assert.deepEqual(validateCatalogs(catalogs), []);
  assert.equal(catalogs.en.auth.login.title, "Sign in");
  assert.equal(catalogs.pl.auth.login.title, "Logowanie");
  assert.equal(catalogs.es.auth.login.title, "Iniciar sesión");
  for (const value of [undefined, null, "../../secrets", "en-US", "toString", 1, {}]) {
    assert.equal(isLocale(value), false);
    assert.deepEqual(await loadMessages(value), catalogs.en);
  }
});

test("checker rejects missing/extra keys, empty values, malformed ICU and changed arguments", () => {
  const en = { auth: { title: "Hello {name}", count: "{count, plural, one {# track} other {# tracks}}" } };
  for (const [pl, expected] of [
    [{ auth: { title: "Witaj {name}" } }, /missing message/],
    [{ ...en, extra: "Extra" }, /extra message/],
    [{ auth: { ...en.auth, title: "  " } }, /empty message/],
    [{ auth: { ...en.auth, title: "Witaj {name" } }, /invalid ICU/],
    [{ auth: { ...en.auth, title: "Witaj {username}" } }, /arguments or tags differ/],
    [{ auth: { ...en.auth, title: "{name, number}" } }, /arguments or tags differ/],
    [{ auth: { ...en.auth, count: "{count, plural, one {# utwór}}" } }, /invalid ICU/],
    [{ auth: { ...en.auth, title: ["Witaj"] } }, /expected a string/],
    [{ auth: {} }, /nonempty namespace/],
  ]) assert.match(validateCatalogs({ en, pl }).join("\n"), expected);
});

test("checker compares nested ICU arguments and rich-text tags, allowing locale-specific plural branches", () => {
  const en = { count: "{count, plural, one {<link>{name}</link>} other {<link>{name}</link>}}" };
  const pl = { count: "{count, plural, one {<link>{name}</link>} few {<link>{name}</link>} many {<link>{name}</link>} other {<link>{name}</link>}}" };
  assert.deepEqual(validateCatalogs({ en, pl }), []);
  assert.match(validateCatalogs({ en, pl: { count: pl.count.replaceAll("link", "strong") } }).join(), /tags differ/);
  assert.match(validateCatalogs({ en, pl: { count: pl.count.replaceAll("{name}", "{otherName}") } }).join(), /arguments/);
});

test("fallback preserves translated values and reports only locale and missing key", () => {
  const english = { auth: { title: "Sign in", description: "Welcome" }, common: { retry: "Retry" } };
  const polish = { auth: { title: "Logowanie", description: " " } };
  const diagnostics = [];
  const merged = withEnglishFallback(english, polish, "pl", (entry) => diagnostics.push(entry));
  assert.deepEqual(merged, { auth: { title: "Logowanie", description: "Welcome" }, common: { retry: "Retry" } });
  assert.deepEqual(diagnostics, [
    { locale: "pl", key: "auth.description" }, { locale: "pl", key: "common.retry" },
  ]);
  assert.equal(polish.auth.description, " ");
  assert.deepEqual(pickNamespaces(merged, ["auth"]), { auth: merged.auth });
  assert.deepEqual(pickNamespaces(merged, []), {});
});

test("translations interpolate parameters and ICU uses Polish plural rules", async () => {
  for (const locale of locales) {
    const messages = await loadMessages(locale);
    const t = createTranslator({ locale, messages });
    assert.ok(t("validation.length", { min: 3, max: 30 }).includes("30"));
  }
  const t = createTranslator({ locale: "pl", messages: {
    tracks: "{count, plural, one {# utwór} few {# utwory} many {# utworów} other {# utworu}}",
  } });
  for (const [count, expected] of [[1, "1 utwór"], [2, "2 utwory"], [5, "5 utworów"], [12, "12 utworów"], [22, "22 utwory"]]) {
    assert.equal(t("tracks", { count }), expected);
  }
});
