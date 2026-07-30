export type DisasterType =
  | "Chemical"
  | "Earthquake"
  | "Fire"
  | "Flood"
  | "Hurricane"
  | "Cyclone"
  | "Landslide"
  | "Tsunami"
  | "Civil Unrest"
  | "Conflict"
  | "Other";

export type InfrastructureType =
  | "Residential"
  | "Commercial"
  | "Government"
  | "Utility"
  | "Transport & Communication"
  | "Community"
  | "Public Space"
  | "School"
  | "Other";

export type DamageLevel = "Critical" | "Medium" | "Low";

export type TaskStatus = "assigned" | "unassigned" | "resolved";

export type ResponderAvailability = "available" | "busy" | "full" | "offline";

export const DISASTER_COLORS: Record<DisasterType, string> = {
  Chemical: "#6F7D2C",
  Earthquake: "#FF6B35",
  Fire: "#E74C3C",
  Flood: "#3498DB",
  Hurricane: "#8E44AD",
  Cyclone: "#6C3483",
  Landslide: "#795548",
  Tsunami: "#1A5276",
  "Civil Unrest": "#E67E22",
  Conflict: "#922B21",
  Other: "#607D8B",
};

// Mirrors Stratum UI's light-theme --danger/--warning/--success tokens.
export const DAMAGE_COLORS: Record<DamageLevel, string> = {
  Critical: "#DC2626",
  Medium: "#D97706",
  Low: "#059669",
};

export const DAMAGE_WEIGHT: Record<DamageLevel, number> = {
  Critical: 3,
  Medium: 2,
  Low: 1,
};

export interface PointProperties {
  point_id: string;
  zone_id: string;
  infrastructure_name: string;
  infrastructure_type: InfrastructureType;
  disaster_type: DisasterType;
  damage_level: DamageLevel;
  casualties: number;
  assigned: boolean;
  assigned_to: string | null;
  task_status: TaskStatus;
  /** Raw backend assignment fields — absent (null) when the point has no assignment. */
  assignment_id: string | null;
  assigned_responder_id: string | null;
  assignment_status_raw: "pending" | "in_progress" | "completed" | "cancelled" | null;
  assignment_priority: "Low" | "Medium" | "Critical" | null;
  assignment_notes: string | null;
  report_summary: string;
  original_report_id: string | null;
  submitted_at: string;
  /** Raw AI classification from the backend model — distinct from the
   *  human-reported disaster_type/damage_level above, which may fall
   *  back to human-entered fields when the AI didn't classify a report. */
  ai_disaster_type: string | null;
  ai_damage_severity: string | null;
}

export type PointFeature = GeoJSON.Feature<GeoJSON.Point, PointProperties>;

export interface ZoneProperties {
  count: number;
  casualties: number;
  pct_critical: number;
  pct_partial: number;
  pct_low: number;
  dominant: "critical" | "medium" | "low";
  dominant_disaster: DisasterType;
  disaster_breakdown: Partial<Record<DisasterType, number>>;
  score: number;
  tier: "Critical" | "Medium" | "Low";
  zone_id: string;
  label: string;
  thumbnail_url?: string;
}

export type ZoneFeature = GeoJSON.Feature<GeoJSON.Point, ZoneProperties>;

export interface Responder {
  id: string;
  name: string;
  team: string;
  status: "available" | "busy" | "offline";
  current_task_zone: string | null;
  lat: number | null;
  lng: number | null;
  active_task_count: number;
  max_tasks: number;
}

export interface TaskAssignment {
  id: string;
  zone_id: string;
  point_id: string;
  responder_name: string;
  priority: "Low" | "Medium" | "Critical";
  status: TaskStatus;
  created_at: string;
}

export interface ScoringSession {
  session_id: string;
}

export interface SeveritySummary {
  pct_destroyed: number;
  pct_partial: number;
  pct_minimal: number;
  total_reports: number;
}

/** "little_or_no_damage" → "Little or no damage" */
export function formatAiLabel(raw: string | null): string | null {
  if (!raw) return null;
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function deriveAvailability(r: Responder): ResponderAvailability {
  if (r.status === "offline") return "offline";
  if (r.active_task_count >= r.max_tasks) return "full";
  if (r.active_task_count > 0) return "busy";
  return "available";
}

export function canAssignToResponder(
  responder: Responder,
  zoneLat: number,
  zoneLng: number
): { eligible: boolean; reason: string; distanceKm: number | null } {
  if (responder.status === "offline")
    return { eligible: false, reason: "Responder is offline", distanceKm: null };
  if (deriveAvailability(responder) === "full")
    return { eligible: false, reason: "At capacity (5/5 tasks)", distanceKm: null };
  if (responder.lat == null || responder.lng == null)
    return { eligible: false, reason: "Location unknown", distanceKm: null };

  const R = 6371;
  const dLat = ((zoneLat - responder.lat) * Math.PI) / 180;
  const dLng = ((zoneLng - responder.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((responder.lat * Math.PI) / 180) *
      Math.cos((zoneLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { eligible: true, reason: `${distanceKm.toFixed(1)} km away`, distanceKm };
}
