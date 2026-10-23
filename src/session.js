// Session tokens stay in HttpOnly cookies. This non-secret ID selects this tab's cookie.
const storageKey = "archetype-session-tab";
const newId = () => crypto.randomUUID().replaceAll("-", "");
let tab;
try {
  const navigation = performance.getEntriesByType("navigation")[0]?.type;
  const saved = sessionStorage.getItem(storageKey);
  tab =
    ["reload", "back_forward"].includes(navigation) &&
    /^[a-f0-9]{32}$/.test(saved || "")
      ? saved
      : newId();
  sessionStorage.setItem(storageKey, tab);
} catch {
  tab = newId();
}
export function rotateSessionTab() {
  tab = newId();
  try {
    sessionStorage.setItem(storageKey, tab);
  } catch {}
}
export const sessionHeaders = () => ({ "X-Archetype-Tab": tab });
export function sessionLink(path) {
  return path + (path.includes("?") ? "&" : "?") + "session_tab=" + tab;
}
