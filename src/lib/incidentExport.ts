/**
 * Export of the incidents table to JSON (REST envelope), GeoJSON, CSV and a
 * zipped ESRI Shapefile bundle.
 *
 * All four formats are driven from one COLUMNS schema so a field added there
 * shows up everywhere at once, and the DBF's 10-byte field-name limit stays
 * next to the long name it abbreviates.
 *
 * Coordinates are exported exactly as the dashboard holds them
 * (point.geometry.coordinates, i.e. GeoJSON [lng, lat] order) — this layer
 * does not second-guess the values it is given.
 */

import type { PointFeature } from "@/types";
import { buildDbf, buildShp, buildShx, buildZip, WGS84_PRJ, type DbfField, type ShpPoint } from "@/lib/shapefile";

export type ExportFormat = "json" | "geojson" | "csv" | "shapefile";

export const EXPORT_FORMATS: { value: ExportFormat; label: string; extension: string; hint: string }[] = [
  { value: "json", label: "JSON", extension: ".json", hint: "REST-style records" },
  { value: "geojson", label: "GeoJSON", extension: ".geojson", hint: "Feature collection" },
  { value: "csv", label: "CSV", extension: ".csv", hint: "Spreadsheet table" },
  { value: "shapefile", label: "Shapefile", extension: ".zip", hint: "shp / shx / dbf / prj" },
];

// ─── Flat row model ─────────────────────────────────────────────────────────

export interface IncidentRow {
  point_id: string;
  original_report_id: string | null;
  zone_id: string;
  county: string;
  infrastructure_name: string;
  infrastructure_type: string;
  disaster_type: string;
  damage_level: string;
  casualties: number;
  task_status: string;
  assigned: boolean;
  assigned_to: string | null;
  submitted_at: string;
  ai_disaster_type: string | null;
  ai_damage_severity: string | null;
  report_summary: string;
  longitude: number;
  latitude: number;
}

/**
 * `countyFor` is supplied by the caller rather than resolved here — the
 * zone→county mapping belongs to the page that also filters on it.
 */
export function toIncidentRows(
  points: PointFeature[],
  countyFor: (point: PointFeature) => string,
): IncidentRow[] {
  return points.map((point) => {
    const props = point.properties;
    const [longitude, latitude] = point.geometry.coordinates;
    return {
      point_id: props.point_id,
      original_report_id: props.original_report_id,
      zone_id: props.zone_id,
      county: countyFor(point),
      infrastructure_name: props.infrastructure_name,
      infrastructure_type: props.infrastructure_type,
      disaster_type: props.disaster_type,
      damage_level: props.damage_level,
      casualties: props.casualties,
      task_status: props.task_status,
      assigned: props.assigned,
      assigned_to: props.assigned_to,
      submitted_at: props.submitted_at,
      ai_disaster_type: props.ai_disaster_type,
      ai_damage_severity: props.ai_damage_severity,
      report_summary: props.report_summary,
      longitude,
      latitude,
    };
  });
}

// ─── Column schema ──────────────────────────────────────────────────────────

interface Column {
  key: keyof IncidentRow;
  /** DBF field names are capped at 10 bytes by the format. */
  dbfName: string;
  dbfType: DbfField["type"];
  dbfLength: number;
  dbfDecimals?: number;
}

const COLUMNS: Column[] = [
  { key: "point_id", dbfName: "POINT_ID", dbfType: "C", dbfLength: 36 },
  { key: "original_report_id", dbfName: "ORIG_RPTID", dbfType: "C", dbfLength: 36 },
  { key: "zone_id", dbfName: "ZONE_ID", dbfType: "C", dbfLength: 20 },
  { key: "county", dbfName: "COUNTY", dbfType: "C", dbfLength: 32 },
  { key: "infrastructure_name", dbfName: "INFRA_NAME", dbfType: "C", dbfLength: 64 },
  { key: "infrastructure_type", dbfName: "INFRA_TYPE", dbfType: "C", dbfLength: 32 },
  { key: "disaster_type", dbfName: "DISASTER", dbfType: "C", dbfLength: 20 },
  { key: "damage_level", dbfName: "DAMAGE", dbfType: "C", dbfLength: 10 },
  { key: "casualties", dbfName: "CASUALTIES", dbfType: "N", dbfLength: 6 },
  { key: "task_status", dbfName: "STATUS", dbfType: "C", dbfLength: 12 },
  { key: "assigned", dbfName: "ASSIGNED", dbfType: "L", dbfLength: 1 },
  { key: "assigned_to", dbfName: "ASSIGNEDTO", dbfType: "C", dbfLength: 64 },
  // Kept as text rather than DBF's 'D' type, which is YYYYMMDD only and would
  // drop the time of day.
  { key: "submitted_at", dbfName: "SUBMITTED", dbfType: "C", dbfLength: 24 },
  { key: "ai_disaster_type", dbfName: "AI_DISAST", dbfType: "C", dbfLength: 32 },
  { key: "ai_damage_severity", dbfName: "AI_DAMAGE", dbfType: "C", dbfLength: 32 },
  { key: "report_summary", dbfName: "SUMMARY", dbfType: "C", dbfLength: 200 },
  { key: "longitude", dbfName: "LON", dbfType: "N", dbfLength: 12, dbfDecimals: 6 },
  { key: "latitude", dbfName: "LAT", dbfType: "N", dbfLength: 12, dbfDecimals: 6 },
];

/**
 * Nulls become empty cells. Booleans differ by target: DBF's logical type
 * stores a single T/F byte, whereas CSV readers expect true/false.
 */
function cellText(column: Column, row: IncidentRow, target: "csv" | "dbf"): string {
  const value = row[column.key];
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") {
    if (target === "dbf") return value ? "T" : "F";
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return column.dbfDecimals ? value.toFixed(column.dbfDecimals) : String(value);
  }
  return value;
}

// ─── Formats ────────────────────────────────────────────────────────────────

function toRestJson(rows: IncidentRow[]): string {
  // Mirrors the DRF envelope the backend itself returns, so the file can be
  // dropped in wherever an /api/ response is already handled.
  return JSON.stringify({ count: rows.length, generated_at: new Date().toISOString(), results: rows }, null, 2);
}

function toGeoJson(rows: IncidentRow[]): string {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      // RFC 7946 fixes the CRS at WGS 84 and drops the member; it is included
      // here for older GIS tools that still look for it.
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features: rows.map((row) => {
        const { longitude, latitude, ...properties } = row;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [longitude, latitude] },
          properties,
        };
      }),
    },
    null,
    2,
  );
}

function csvCell(value: string): string {
  // RFC 4180: quote when the value contains a delimiter, quote or newline, and
  // escape embedded quotes by doubling them.
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: IncidentRow[]): string {
  const header = COLUMNS.map((c) => c.key).join(",");
  const body = rows.map((row) => COLUMNS.map((c) => csvCell(cellText(c, row, "csv"))).join(",")).join("\r\n");
  // Leading BOM so Excel reads the file as UTF-8 instead of the local codepage.
  return `﻿${header}\r\n${body}\r\n`;
}

function toShapefileZip(rows: IncidentRow[], basename: string): Uint8Array {
  const points: ShpPoint[] = rows.map((row) => ({ x: row.longitude, y: row.latitude }));
  const fields: DbfField[] = COLUMNS.map((c) => ({
    name: c.dbfName,
    type: c.dbfType,
    length: c.dbfLength,
    decimals: c.dbfDecimals,
  }));
  const table = rows.map((row) => COLUMNS.map((c) => cellText(c, row, "dbf")));

  const utf8 = new TextEncoder();
  return buildZip([
    { name: `${basename}.shp`, data: buildShp(points) },
    { name: `${basename}.shx`, data: buildShx(points) },
    { name: `${basename}.dbf`, data: buildDbf(fields, table) },
    { name: `${basename}.prj`, data: utf8.encode(WGS84_PRJ) },
  ]);
}

// ─── Entry point ────────────────────────────────────────────────────────────

export interface ExportResult {
  blob: Blob;
  filename: string;
  /** Rows a Shapefile cannot represent (missing or non-finite coordinates). */
  skipped: number;
}

/**
 * Builds the file for `format`. Shapefile is the only format that drops rows:
 * its Point record has no null representation, so rows without usable
 * coordinates are excluded and reported back via `skipped`.
 */
export function buildIncidentExport(format: ExportFormat, rows: IncidentRow[]): ExportResult {
  const stamp = new Date().toISOString().slice(0, 10);
  const basename = `faraja-incidents-${stamp}`;

  switch (format) {
    case "json":
      return {
        blob: new Blob([toRestJson(rows)], { type: "application/json" }),
        filename: `${basename}.json`,
        skipped: 0,
      };
    case "geojson":
      return {
        blob: new Blob([toGeoJson(rows)], { type: "application/geo+json" }),
        filename: `${basename}.geojson`,
        skipped: 0,
      };
    case "csv":
      return {
        blob: new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }),
        filename: `${basename}.csv`,
        skipped: 0,
      };
    case "shapefile": {
      const mappable = rows.filter((r) => Number.isFinite(r.longitude) && Number.isFinite(r.latitude));
      return {
        blob: new Blob([toShapefileZip(mappable, basename) as BlobPart], { type: "application/zip" }),
        filename: `${basename}-shapefile.zip`,
        skipped: rows.length - mappable.length,
      };
    }
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
