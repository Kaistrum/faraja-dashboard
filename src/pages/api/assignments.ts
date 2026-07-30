// Canonical endpoint is /api/tasks — this alias exists for backwards compatibility.
import type { NextApiRequest, NextApiResponse } from "next";
import type { TaskAssignment } from "@/types";
import { fetchAllPages, rapidaAssignmentToTask, type RapidaAssignment } from "@/lib/rapida";
import { getCached, setCached } from "@/lib/serverCache";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

const ASSIGNMENTS_CACHE_KEY = "assignments";
const CACHE_TTL_MS = 30_000;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TaskAssignment[] | { success: false }>,
) {
  // Read-only alias — this used to silently no-op on POST/PATCH/DELETE
  // (no method branching at all), which looked like a successful write to
  // any caller but never touched the backend. Reject those explicitly now;
  // real writes go through /api/tasks (create) or /api/assignments/[id] (update).
  if (req.method !== "GET") return res.status(405).json({ success: false });

  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");

  if (!BASE) return res.status(200).json([]);

  try {
    const cached = getCached<TaskAssignment[]>(ASSIGNMENTS_CACHE_KEY);
    if (cached) return res.status(200).json(cached);

    const raw = await fetchAllPages<RapidaAssignment>(`${BASE}/assignments/`);
    const tasks = raw.map(rapidaAssignmentToTask);
    setCached(ASSIGNMENTS_CACHE_KEY, tasks, CACHE_TTL_MS);
    return res.status(200).json(tasks);
  } catch (err) {
    console.error("Failed to fetch assignments (alias):", err);
    return res.status(500).json([]);
  }
}
