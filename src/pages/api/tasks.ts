import type { NextApiRequest, NextApiResponse } from "next";
import type { TaskAssignment } from "@/types";
import { fetchAllPages, mapPriorityToBackend, rapidaAssignmentToTask, type RapidaAssignment } from "@/lib/rapida";
import { backendAuthHeaders } from "@/lib/backendAuth";
import { getCached, setCached, invalidateCached } from "@/lib/serverCache";
import { getCachedPoints, invalidatePointsCache } from "@/pages/api/clusters";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

const ASSIGNMENTS_CACHE_KEY = "assignments";
const CACHE_TTL_MS = 30_000;

async function getTasks(): Promise<TaskAssignment[]> {
  const cached = getCached<TaskAssignment[]>(ASSIGNMENTS_CACHE_KEY);
  if (cached) return cached;

  const assignments = await fetchAllPages<RapidaAssignment>(`${BASE}/assignments/`);
  const tasks = assignments.map(rapidaAssignmentToTask);
  setCached(ASSIGNMENTS_CACHE_KEY, tasks, CACHE_TTL_MS);
  return tasks;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");

  if (!BASE) return res.status(200).json([]);

  if (req.method === "GET") {
    try {
      return res.status(200).json(await getTasks());
    } catch (err) {
      console.error("Failed to fetch assignments:", err);
      return res.status(500).json([]);
    }
  }

  if (req.method === "POST") {
    const { point_id, responder_id, priority, instructions } = req.body as {
      point_id?: string;
      responder_id?: string;
      priority?: TaskAssignment["priority"];
      instructions?: string;
    };

    if (!point_id || !responder_id) {
      return res.status(400).json({ success: false, error: "point_id and responder_id are required" });
    }

    try {
      // The backend's Assignment.report FK points at the original (pre-AI)
      // CrisisReport, not the final report our UI identifies points by — see
      // the comment on rapidaReportToPoint / original_report_id in lib/rapida.ts.
      // Resolve it here so every caller can keep using the final report id.
      const points = await getCachedPoints();
      const point = points.find((p) => p.properties.point_id === point_id);
      if (!point) {
        return res.status(404).json({ success: false, error: "Unknown incident — it may have been removed" });
      }
      if (!point.properties.original_report_id) {
        return res.status(422).json({
          success: false,
          error: "This report has no linked original report and cannot be assigned yet",
        });
      }

      const fwdRes = await fetch(`${BASE}/assignments/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...backendAuthHeaders(),
        },
        body: JSON.stringify({
          report: point.properties.original_report_id,
          responder: responder_id,
          priority: mapPriorityToBackend(priority),
          notes: instructions,
        }),
      });

      if (!fwdRes.ok) {
        const detail = await fwdRes.text().catch(() => "");
        console.error(`Failed to create assignment (backend ${fwdRes.status}):`, detail);
        return res.status(fwdRes.status).json({
          success: false,
          error: detail || `Backend rejected the assignment (${fwdRes.status})`,
        });
      }

      // Bust caches so the next read (dispatcher or responder) reflects the new assignment.
      invalidateCached(ASSIGNMENTS_CACHE_KEY);
      invalidatePointsCache();

      const created = (await fwdRes.json()) as Record<string, unknown>;
      return res.status(200).json({ task_id: created.assignment_id ?? `rapida-${Date.now()}`, success: true });
    } catch (err) {
      console.error("Failed to POST assignment:", err);
      return res.status(502).json({ success: false, error: "Could not reach the backend" });
    }
  }

  return res.status(405).json({ success: false });
}
