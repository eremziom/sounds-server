import { getRequestConfig } from "next-intl/server";
import { defaultLocale, timeZone } from "./config";
import { loadMessages } from "./messages";

export default getRequestConfig(async () => ({
  // Stage 3 will resolve the request cookie and Accept-Language here.
  locale: defaultLocale,
  timeZone,
  messages: await loadMessages(defaultLocale),
}));
