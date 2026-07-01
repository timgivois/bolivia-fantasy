import { getRequestConfig } from "next-intl/server";

import { defaultLocale } from "./config";

export default getRequestConfig(async () => {
  // Locale detection (user preference, cookie, etc.) comes later.
  // Spanish is the default and only locale for now.
  const locale = defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
