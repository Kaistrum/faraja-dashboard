// Mock data — replace with DB query
import type { NextApiRequest, NextApiResponse } from "next";
import type { ScoringSession } from "@/types";

export default function handler(req: NextApiRequest, res: NextApiResponse<ScoringSession>) {
  if (req.method !== "POST") {
    res.status(405).json({ session_id: "" });
    return;
  }

  res.status(200).json({ session_id: "mock-session-uuid-001" });
}
