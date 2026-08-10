import type { NextApiRequest, NextApiResponse } from "next";
import type { Responder } from "@/types";
import { fetchAllPages, rapidaResponderToInternal, type RapidaResponder, type RapidaAssignment } from "@/lib/rapida";
import { backendAuthHeaders } from "@/lib/backendAuth";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

async function getResponders(res: NextApiResponse) {
  if (!BASE) return res.status(200).json([]);

  try {
    const [raw, assignments] = await Promise.all([
      fetchAllPages<RapidaResponder>(`${BASE}/responders/`),
      fetchAllPages<RapidaAssignment>(`${BASE}/assignments/`),
    ]);
    return res.status(200).json(raw.map((r) => rapidaResponderToInternal(r, assignments)));
  } catch (err) {
    console.error("Failed to fetch responders:", err);
    return res.status(500).json([]);
  }
}

async function createResponder(req: NextApiRequest, res: NextApiResponse) {
  const { name, email, password, role, organization } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    organization?: string;
  };
  if (!name?.trim() || !email?.trim() || !password || !role) {
    return res.status(400).json({ success: false, error: "name, email, password, and role are required" });
  }
  if (!BASE) {
    return res.status(503).json({ success: false, error: "Backend is not configured" });
  }

  try {
    const fwdRes = await fetch(`${BASE}/responders/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...backendAuthHeaders(),
      },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        password_hash: password,
        role,
        organization: organization?.trim() || undefined,
        // New registrants start inactive — field-signin.tsx flips this to
        // true the first time the responder actually signs in.
        is_active: false,
      }),
    });

    if (!fwdRes.ok) {
      const detail = await fwdRes.text().catch(() => "");
      console.error(`Failed to create responder (backend ${fwdRes.status}):`, detail);
      return res.status(fwdRes.status).json({
        success: false,
        error: detail || `Backend rejected the responder (${fwdRes.status})`,
      });
    }

    const created = (await fwdRes.json()) as RapidaResponder;
    return res.status(200).json({ success: true, responder: rapidaResponderToInternal(created) });
  } catch (err) {
    console.error("Failed to POST responder:", err);
    return res.status(502).json({ success: false, error: "Could not reach the backend" });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Responder[] | { success: boolean; error?: string; responder?: Responder }>,
) {
  if (req.method === "GET") return getResponders(res);
  if (req.method === "POST") return createResponder(req, res);
  return res.status(405).json({ success: false, error: "Method not allowed" });
}
