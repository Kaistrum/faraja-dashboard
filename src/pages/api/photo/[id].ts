import type { NextApiRequest, NextApiResponse } from "next";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string" || !id) return res.status(400).json({ photo_url: null });
  if (!BASE) return res.status(200).json({ photo_url: null });

  try {
    const r = await fetch(`${BASE}/reports/${id}/`);
    if (!r.ok) return res.status(200).json({ photo_url: null });
    const data = (await r.json()) as { photo_url?: string | null };
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.status(200).json({ photo_url: data.photo_url ?? null });
  } catch {
    return res.status(200).json({ photo_url: null });
  }
}
