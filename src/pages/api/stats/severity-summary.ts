import type { NextApiRequest, NextApiResponse } from "next";
import type { SeveritySummary } from "@/types";
import { fetchAllPages, type RapidaFinalReport } from "@/lib/rapida";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

let summaryCache: { data: SeveritySummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export default async function handler(_req: NextApiRequest, res: NextApiResponse<SeveritySummary>) {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");

  if (!BASE) {
    return res.status(200).json({ pct_destroyed: 0, pct_partial: 0, pct_minimal: 0, total_reports: 0 });
  }

  try {
    const now = Date.now();
    if (!summaryCache || summaryCache.expiresAt <= now) {
      const reports = await fetchAllPages<RapidaFinalReport>(`${BASE}/final-reports/`);
      const total = reports.length;
      if (total === 0) {
        summaryCache = {
          data: { pct_destroyed: 0, pct_partial: 0, pct_minimal: 0, total_reports: 0 },
          expiresAt: now + CACHE_TTL_MS,
        };
      } else {
        const destroyed = reports.filter(
          (r) => r.damage_level === "complete" || r.ai_damage_severity === "severe_damage",
        ).length;
        const partial = reports.filter(
          (r) =>
            (r.damage_level === "partial" || r.ai_damage_severity === "mild_damage") &&
            r.damage_level !== "complete" &&
            r.ai_damage_severity !== "severe_damage",
        ).length;
        const minimal = total - destroyed - partial;

        summaryCache = {
          data: {
            pct_destroyed: Math.round((destroyed / total) * 100),
            pct_partial: Math.round((partial / total) * 100),
            pct_minimal: Math.max(0, Math.round((minimal / total) * 100)),
            total_reports: total,
          },
          expiresAt: now + CACHE_TTL_MS,
        };
      }
    }
    return res.status(200).json(summaryCache.data);
  } catch (err) {
    console.error("Failed to compute severity summary:", err);
    return res.status(200).json({ pct_destroyed: 0, pct_partial: 0, pct_minimal: 0, total_reports: 0 });
  }
}
