import type { NextApiRequest, NextApiResponse } from "next";
import type { Responder } from "@/types";
import { fetchAllPages, rapidaResponderToInternal, type RapidaResponder } from "@/lib/rapida";

const BASE = (process.env.RAPIDA_API_BASE ?? "").replace(/\/+$/, "");

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<Responder[]>,
) {
  if (!BASE) return res.status(200).json([]);

  try {
    const raw = await fetchAllPages<RapidaResponder>(`${BASE}/responders/`);
    return res.status(200).json(raw.map(rapidaResponderToInternal));
  } catch (err) {
    console.error("Failed to fetch responders:", err);
    return res.status(500).json([]);
  }
}
