import type { NextApiRequest, NextApiResponse } from "next";
import type { TaskAssignment } from "@/types";
import { fetchAllPages, rapidaAssignmentToTask, type RapidaAssignment } from "@/lib/rapida";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

// ─── Server-side cache (30 s) ─────────────────────────────────────────────────
let assignmentCache: { tasks: TaskAssignment[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

async function getTasks(): Promise<TaskAssignment[]> {
  const now = Date.now();
  if (assignmentCache && assignmentCache.expiresAt > now) return assignmentCache.tasks;

  const assignments = await fetchAllPages<RapidaAssignment>(`${BASE}/assignments/`);
  const tasks = assignments.map(rapidaAssignmentToTask);
  assignmentCache = { tasks, expiresAt: now + CACHE_TTL_MS };
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
    try {
      const { point_id, responder_id, priority, instructions } = req.body as {
        point_id?: string;
        responder_id?: string;
        priority?: string;
        instructions?: string;
      };
      const fwdRes = await fetch(`${BASE}/assignments/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          report: point_id,
          responder: responder_id,
          priority: priority?.toLowerCase(),
          notes: instructions,
        }),
      });
      // Bust the cache so next GET reflects the new assignment
      assignmentCache = null;
      if (fwdRes.ok) {
        const created = (await fwdRes.json()) as Record<string, unknown>;
        return res.status(200).json({ task_id: created.assignment_id ?? `rapida-${Date.now()}`, success: true });
      }
    } catch (err) {
      console.error("Failed to POST assignment:", err);
    }
    return res.status(200).json({ task_id: `local-${Date.now()}`, success: true });
  }

  return res.status(405).json({ success: false });
}
