import type { NextApiRequest, NextApiResponse } from "next";
import { backendAuthHeaders } from "@/lib/backendAuth";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") return res.status(405).json({ success: false });
  if (!BASE) return res.status(503).json({ success: false, error: "Backend not configured" });

  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ success: false, error: "Missing responder id" });

  const { is_active } = req.body as { is_active?: boolean };
  if (typeof is_active !== "boolean") {
    return res.status(400).json({ success: false, error: "is_active must be a boolean" });
  }

  try {
    const fwdRes = await fetch(`${BASE}/responders/${id}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...backendAuthHeaders(),
      },
      body: JSON.stringify({ is_active }),
    });

    if (!fwdRes.ok) {
      const detail = await fwdRes.text().catch(() => "");
      console.error(`Failed to PATCH responder ${id} (backend ${fwdRes.status}):`, detail);
      return res.status(fwdRes.status).json({
        success: false,
        error: detail || `Backend rejected the update (${fwdRes.status})`,
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(`Failed to PATCH responder ${id}:`, err);
    return res.status(502).json({ success: false, error: "Could not reach the backend" });
  }
}
