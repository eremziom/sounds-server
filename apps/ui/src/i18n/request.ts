import { getRequestConfig } from "next-intl/server";
import { timeZone } from "./config";
import { getRequestLocale } from "./locale";
import { loadMessages } from "./messages";
import { formats } from "./formats";

export default getRequestConfig(async () => {
  const locale = await getRequestLocale();
  return { locale, timeZone, formats, messages: await loadMessages(locale) };
});
