// Mock data — replace with DB query
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.status(200).json({
    access: 20,
    debris: 10,
    misc: 5,
    misc_label: "Flood risk",
    reasoning:
      "Given the described flooding scenario, access routes are likely compromised — access difficulty weighted higher. Debris is moderate. Flood risk added as miscellaneous factor.",
  });
}
