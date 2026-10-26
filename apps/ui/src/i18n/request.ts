import { getRequestConfig } from "next-intl/server";
import { timeZone } from "./config";
import { getRequestLocale } from "./locale";
import { loadMessages } from "./messages";

export default getRequestConfig(async () => {
  const locale = await getRequestLocale();
  return { locale, timeZone, messages: await loadMessages(locale) };
});
