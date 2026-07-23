import type { NextApiRequest, NextApiResponse } from "next";
import type { PointFeature } from "@/types";
import { fetchAllPages, rapidaReportToPoint, type RapidaFinalReport, type RapidaAssignment } from "@/lib/rapida";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

// ─── Server-side cache (30 s) ─────────────────────────────────────────────────
let reportCache: { points: PointFeature[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

async function getPoints(): Promise<PointFeature[]> {
  const now = Date.now();
  if (reportCache && reportCache.expiresAt > now) return reportCache.points;

  const [reports, assignments] = await Promise.all([
    fetchAllPages<RapidaFinalReport>(`${BASE}/final-reports/`),
    fetchAllPages<RapidaAssignment>(`${BASE}/assignments/`),
  ]);

  // A report can have more than one assignment over time (reassignment) —
  // keep only the most recent one per report.
  const latestAssignmentByReport = new Map<string, RapidaAssignment>();
  for (const a of assignments) {
    const existing = latestAssignmentByReport.get(a.report);
    if (!existing || new Date(a.assigned_at) > new Date(existing.assigned_at)) {
      latestAssignmentByReport.set(a.report, a);
    }
  }

  const points = reports
    .map((r) => {
      // Assignments reference the original (pre-AI-processing) report id,
      // not the final report's own id — match on that instead.
      const assignment = r.original_report_id
        ? (latestAssignmentByReport.get(r.original_report_id) ?? null)
        : null;
      return rapidaReportToPoint(r, assignment);
    })
    .filter((p): p is PointFeature => p !== null);

  reportCache = { points, expiresAt: now + CACHE_TTL_MS };
  return points;
}

function inBbox(
  coords: number[],
  west: number,
  south: number,
  east: number,
  north: number,
): boolean {
  const [lng, lat] = coords;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");

  const { bbox, active_session_id } = req.query;
  if (typeof active_session_id === "string") {
    console.log("active_session_id:", active_session_id);
  }

  if (!BASE) return res.status(200).json({ points: [] });

  try {
    let points = await getPoints();

    if (typeof bbox === "string") {
      const [west, south, east, north] = bbox.split(",").map(Number);
      points = points.filter((pt) => inBbox(pt.geometry.coordinates, west, south, east, north));
    }

    return res.status(200).json({ points });
  } catch (err) {
    console.error("Failed to fetch final reports:", err);
    return res.status(500).json({ points: [] });
  }
}
