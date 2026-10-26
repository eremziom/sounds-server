// Compiled by Next.js/tsc; never imported into the application bundle.
import type { useTranslations } from "next-intl";
import type { Locale } from "./config";

type LoginTranslator = ReturnType<typeof useTranslations<"auth.login">>;

export function checkI18nTypes(t: LoginTranslator) {
  t("title");
  // @ts-expect-error Unknown keys must fail compilation.
  t("titel");
  const locale: Locale = "pl";
  // @ts-expect-error Unsupported locales must fail compilation.
  const unsupported: Locale = "de";
  return { locale, unsupported };
}
