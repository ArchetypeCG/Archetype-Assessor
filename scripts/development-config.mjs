// Codespaces terminates HTTPS before forwarding requests to Vite and the API.
// Trust only this workspace's exact forwarded origin, never arbitrary forwarded headers.
export function developmentConfig(env = process.env) {
  const name = env.CODESPACE_NAME;
  const domain =
    env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || "app.github.dev";
  const host =
    name &&
    /^[a-z0-9-]+$/.test(name) &&
    /^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(domain)
      ? `${name}-5173.${domain}`
      : null;
  return {
    origin: env.APP_ORIGIN || (host ? `https://${host}` : undefined),
    allowedHosts: host ? [host] : [],
    secureCookies: env.COOKIE_SECURE ?? (host ? "1" : "0"),
  };
}
