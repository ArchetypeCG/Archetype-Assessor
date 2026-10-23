// A tab ID selects an HttpOnly cookie; it is not an authentication token.
export function sessionCookieName(headers, url, method) {
  const tab =
    headers["x-archetype-tab"] ??
    (method === "GET" ? url.searchParams.get("session_tab") : null);
  if (tab == null) return "archetype_session"; // Existing API clients remain supported.
  if (typeof tab !== "string" || !/^[a-f0-9]{32}$/.test(tab)) {
    const error = Error(
      "Invalid browser session identifier. Refresh and sign in again.",
    );
    error.status = 400;
    throw error;
  }
  return `archetype_session_${tab}`;
}
