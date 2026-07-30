/**
 * Credentials for server-side writes to the RAPIDA backend.
 *
 * The backend permits anonymous GETs but requires an authenticated Django
 * user for POST/PATCH/DELETE. There is no per-dispatcher login against that
 * backend (app-level sign-in here is separate), so all dashboard-originated
 * writes are made under a single service account, configured via env vars.
 */
export function backendAuthHeaders(): Record<string, string> {
  const user = process.env.RAPIDA_API_USER;
  const pass = process.env.RAPIDA_API_PASSWORD;
  if (!user || !pass) return {};
  const encoded = Buffer.from(`${user}:${pass}`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}
