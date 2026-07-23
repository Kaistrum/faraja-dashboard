// Canonical endpoint is /api/tasks — this alias exists for backwards compatibility.
import type { NextApiRequest, NextApiResponse } from "next";
import type { TaskAssignment } from "@/types";
import { fetchAllPages, rapidaAssignmentToTask, type RapidaAssignment } from "@/lib/rapida";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

let assignmentCache: { tasks: TaskAssignment[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<TaskAssignment[]>,
) {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");

  if (!BASE) return res.status(200).json([]);

  try {
    const now = Date.now();
    if (!assignmentCache || assignmentCache.expiresAt <= now) {
      const raw = await fetchAllPages<RapidaAssignment>(`${BASE}/assignments/`);
      assignmentCache = { tasks: raw.map(rapidaAssignmentToTask), expiresAt: now + CACHE_TTL_MS };
    }
    return res.status(200).json(assignmentCache.tasks);
  } catch (err) {
    console.error("Failed to fetch assignments (alias):", err);
    return res.status(500).json([]);
  }
}
