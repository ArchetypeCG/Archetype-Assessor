function originURL(value) {
  const url = new URL(value.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.includes("*") ||
    url.hostname.includes(",")
  )
    throw Error("Invalid website origin");
  return url;
}
export function applicationOrigins(env = process.env) {
  const origins = new Set();
  let primary;
  for (const [name, values] of [
    ["APP_ORIGIN", [env.APP_ORIGIN]],
    ["RENDER_EXTERNAL_URL", [env.RENDER_EXTERNAL_URL]],
    ["ADDITIONAL_APP_ORIGINS", (env.ADDITIONAL_APP_ORIGINS || "").split(",")],
  ]) {
    for (const value of values) {
      if (!value?.trim()) continue;
      let url;
      try {
        url = originURL(value);
      } catch {
        throw Error(
          `${name} must contain complete website addresses such as https://portfolio.example.org.`,
        );
      }
      if (env.NODE_ENV === "production" && url.protocol !== "https:")
        throw Error(`${name} must use HTTPS in production.`);
      origins.add(url.origin);
      if (name !== "ADDITIONAL_APP_ORIGINS" && !primary) primary = url.origin;
    }
  }
  return {
    primary,
    allowed: [...origins],
    allows(value, host) {
      try {
        const url = originURL(value);
        if (url.pathname !== "/" || url.search || url.hash) return false;
        return origins.size ? origins.has(url.origin) : url.host === host;
      } catch {
        return false;
      }
    },
    rejection(value) {
      try {
        return `Sign-in or saving is blocked for ${originURL(value).origin}. In this Render service’s Environment settings, set APP_ORIGIN to that website address, save and redeploy, or open the service’s original Render address.`;
      } catch {
        return "Invalid request origin.";
      }
    },
  };
}
