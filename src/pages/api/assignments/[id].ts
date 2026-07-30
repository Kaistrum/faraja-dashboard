import type { NextApiRequest, NextApiResponse } from "next";
import { backendAuthHeaders } from "@/lib/backendAuth";
import { invalidateCached } from "@/lib/serverCache";
import { invalidatePointsCache } from "@/pages/api/clusters";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

// Status transitions a responder is allowed to make from the field view.
// "pending" (initial, dispatcher-set) and "cancelled" (dispatcher-only) are
// deliberately excluded here.
const ALLOWED_STATUSES = new Set(["in_progress", "completed"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") return res.status(405).json({ success: false });
  if (!BASE) return res.status(503).json({ success: false, error: "Backend not configured" });

  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ success: false, error: "Missing assignment id" });

  const { status } = req.body as { status?: string };
  if (!status || !ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({ success: false, error: `status must be one of: ${[...ALLOWED_STATUSES].join(", ")}` });
  }

  try {
    const fwdRes = await fetch(`${BASE}/assignments/${id}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...backendAuthHeaders(),
      },
      body: JSON.stringify({ status }),
    });

    if (!fwdRes.ok) {
      const detail = await fwdRes.text().catch(() => "");
      console.error(`Failed to PATCH assignment ${id} (backend ${fwdRes.status}):`, detail);
      return res.status(fwdRes.status).json({
        success: false,
        error: detail || `Backend rejected the update (${fwdRes.status})`,
      });
    }

    invalidateCached("assignments");
    invalidatePointsCache();

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(`Failed to PATCH assignment ${id}:`, err);
    return res.status(502).json({ success: false, error: "Could not reach the backend" });
  }
}
