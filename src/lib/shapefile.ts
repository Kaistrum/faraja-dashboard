/**
 * Dependency-free writers for the ESRI Shapefile point format and for
 * STORE-method (uncompressed) ZIP archives.
 *
 * A "shapefile" is really a bundle of sibling files that must be delivered
 * together — .shp (geometry), .shx (geometry index), .dbf (attribute table)
 * and .prj (coordinate system) — so the export path zips them.
 *
 * Field layouts below follow the ESRI Shapefile Technical Description
 * (July 1998) and the dBASE III table format. Byte offsets are spelled out
 * rather than derived, because a single wrong offset produces a file that
 * opens but silently misreads every row.
 *
 * Endianness is not uniform in this format: the .shp/.shx file headers and
 * record headers are big-endian, while the shape content is little-endian.
 * Every setInt32/setFloat64 below passes the flag explicitly for that reason.
 */

// ─── CRC-32 (ZIP entries carry a checksum per file) ──────────────────────────

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Both DBF cells and ZIP entry names are single-byte; drop anything else. */
function ascii(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "?");
}

function asciiBytes(value: string): Uint8Array {
  const clean = ascii(value);
  const out = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) out[i] = clean.charCodeAt(i);
  return out;
}

// ─── .shp / .shx ────────────────────────────────────────────────────────────

export interface ShpPoint {
  x: number;
  y: number;
}

const SHAPE_TYPE_POINT = 1;
const SHP_HEADER_BYTES = 100;
/** 8-byte record header + 20-byte Point content (type + X + Y). */
const SHP_RECORD_BYTES = 28;
/** Content length is measured in 16-bit words: 20 bytes → 10 words. */
const POINT_CONTENT_WORDS = 10;

interface BBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

function bboxOf(points: ShpPoint[]): BBox {
  if (points.length === 0) return { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  for (const p of points) {
    if (p.x < xmin) xmin = p.x;
    if (p.y < ymin) ymin = p.y;
    if (p.x > xmax) xmax = p.x;
    if (p.y > ymax) ymax = p.y;
  }
  return { xmin, ymin, xmax, ymax };
}

/** The .shp and .shx share an identical 100-byte header apart from length. */
function writeShpHeader(view: DataView, fileLengthBytes: number, bbox: BBox): void {
  view.setInt32(0, 9994, false); // file code
  // Bytes 4-23 are unused and stay zero.
  view.setInt32(24, fileLengthBytes / 2, false); // total length, in 16-bit words
  view.setInt32(28, 1000, true); // version
  view.setInt32(32, SHAPE_TYPE_POINT, true);
  view.setFloat64(36, bbox.xmin, true);
  view.setFloat64(44, bbox.ymin, true);
  view.setFloat64(52, bbox.xmax, true);
  view.setFloat64(60, bbox.ymax, true);
  // Zmin/Zmax/Mmin/Mmax (bytes 68-99) stay zero — unused for 2D points.
}

export function buildShp(points: ShpPoint[]): Uint8Array {
  const totalBytes = SHP_HEADER_BYTES + points.length * SHP_RECORD_BYTES;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  writeShpHeader(view, totalBytes, bboxOf(points));

  let offset = SHP_HEADER_BYTES;
  points.forEach((point, i) => {
    view.setInt32(offset, i + 1, false); // record numbers are 1-based
    view.setInt32(offset + 4, POINT_CONTENT_WORDS, false);
    view.setInt32(offset + 8, SHAPE_TYPE_POINT, true);
    view.setFloat64(offset + 12, point.x, true);
    view.setFloat64(offset + 20, point.y, true);
    offset += SHP_RECORD_BYTES;
  });

  return new Uint8Array(buffer);
}

export function buildShx(points: ShpPoint[]): Uint8Array {
  const totalBytes = SHP_HEADER_BYTES + points.length * 8;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  writeShpHeader(view, totalBytes, bboxOf(points));

  // Offsets point into the .shp file and are measured in 16-bit words, so the
  // first record header — sitting just past the 100-byte header — is word 50.
  let recordWord = SHP_HEADER_BYTES / 2;
  let offset = SHP_HEADER_BYTES;
  for (let i = 0; i < points.length; i++) {
    view.setInt32(offset, recordWord, false);
    view.setInt32(offset + 4, POINT_CONTENT_WORDS, false);
    recordWord += SHP_RECORD_BYTES / 2;
    offset += 8;
  }

  return new Uint8Array(buffer);
}

// ─── .dbf (dBASE III attribute table) ───────────────────────────────────────

export type DbfFieldType = "C" | "N" | "L";

export interface DbfField {
  /** Truncated to 10 bytes — a hard limit of the format, not a choice. */
  name: string;
  type: DbfFieldType;
  length: number;
  decimals?: number;
}

const DBF_FIELD_DESC_BYTES = 32;
const DBF_FIELD_TERMINATOR = 0x0d;
const DBF_EOF = 0x1a;
const DBF_RECORD_ACTIVE = 0x20; // 0x2a would mark the row deleted

/** `rows` is pre-stringified, one cell per field, in field order. */
export function buildDbf(fields: DbfField[], rows: string[][]): Uint8Array {
  const headerBytes = DBF_FIELD_DESC_BYTES * (fields.length + 1) + 1;
  const recordBytes = 1 + fields.reduce((sum, f) => sum + f.length, 0);
  const totalBytes = headerBytes + rows.length * recordBytes + 1;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const now = new Date();
  view.setUint8(0, 0x03); // dBASE III without a memo file
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setInt32(4, rows.length, true);
  view.setInt16(8, headerBytes, true);
  view.setInt16(10, recordBytes, true);
  // Bytes 12-31 are reserved and stay zero.

  fields.forEach((field, i) => {
    const at = DBF_FIELD_DESC_BYTES * (i + 1);
    const name = ascii(field.name).slice(0, 10);
    for (let c = 0; c < name.length; c++) bytes[at + c] = name.charCodeAt(c);
    view.setUint8(at + 11, field.type.charCodeAt(0));
    view.setUint8(at + 16, field.length);
    view.setUint8(at + 17, field.decimals ?? 0);
  });
  view.setUint8(headerBytes - 1, DBF_FIELD_TERMINATOR);

  let offset = headerBytes;
  for (const row of rows) {
    bytes[offset] = DBF_RECORD_ACTIVE;
    offset += 1;
    fields.forEach((field, i) => {
      // 'C' is left-justified, 'N' right-justified; both are space-padded to
      // the fixed field width. Overlong values are truncated, not wrapped.
      const raw = ascii(row[i] ?? "").slice(0, field.length);
      const padding = " ".repeat(field.length - raw.length);
      const cell = field.type === "N" ? padding + raw : raw + padding;
      for (let c = 0; c < field.length; c++) bytes[offset + c] = cell.charCodeAt(c);
      offset += field.length;
    });
  }
  bytes[offset] = DBF_EOF;

  return bytes;
}

// ─── .prj ───────────────────────────────────────────────────────────────────

/**
 * WGS 84 (EPSG:4326) in the ESRI WKT dialect. Without a .prj alongside the
 * .shp, GIS software treats the coordinates as having an unknown CRS and
 * refuses to reproject them.
 */
export const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// ─── ZIP (stored, no compression) ───────────────────────────────────────────

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const EOCD_BYTES = 22;

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    // Seconds have 2-second resolution in the DOS format.
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Writes a ZIP with the STORE method. Compression is skipped deliberately:
 * it would mean shipping an inflate implementation, and shapefile bundles at
 * this scale are small enough that the saving is not worth the surface area.
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const names = entries.map((e) => asciiBytes(e.name));
  const localBytes = entries.reduce(
    (sum, e, i) => sum + LOCAL_HEADER_BYTES + names[i].length + e.data.length,
    0,
  );
  const centralBytes = entries.reduce((sum, _, i) => sum + CENTRAL_HEADER_BYTES + names[i].length, 0);

  const buffer = new ArrayBuffer(localBytes + centralBytes + EOCD_BYTES);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const { time, date } = dosDateTime(new Date());

  const localOffsets: number[] = [];
  const crcs: number[] = [];
  let offset = 0;

  entries.forEach((entry, i) => {
    localOffsets.push(offset);
    const crc = crc32(entry.data);
    crcs.push(crc);

    view.setUint32(offset, 0x04034b50, true); // local file header signature
    view.setUint16(offset + 4, 20, true); // version needed to extract
    view.setUint16(offset + 6, 0, true); // general purpose flags
    view.setUint16(offset + 8, 0, true); // method 0 = stored
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, crc, true);
    view.setUint32(offset + 18, entry.data.length, true); // compressed size
    view.setUint32(offset + 22, entry.data.length, true); // uncompressed size
    view.setUint16(offset + 26, names[i].length, true);
    view.setUint16(offset + 28, 0, true); // extra field length
    bytes.set(names[i], offset + LOCAL_HEADER_BYTES);
    bytes.set(entry.data, offset + LOCAL_HEADER_BYTES + names[i].length);

    offset += LOCAL_HEADER_BYTES + names[i].length + entry.data.length;
  });

  const centralStart = offset;
  entries.forEach((entry, i) => {
    view.setUint32(offset, 0x02014b50, true); // central directory signature
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, 0, true);
    view.setUint16(offset + 10, 0, true); // method 0 = stored
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, crcs[i], true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, names[i].length, true);
    view.setUint16(offset + 30, 0, true); // extra field length
    view.setUint16(offset + 32, 0, true); // file comment length
    view.setUint16(offset + 34, 0, true); // disk number start
    view.setUint16(offset + 36, 0, true); // internal attributes
    view.setUint32(offset + 38, 0, true); // external attributes
    view.setUint32(offset + 42, localOffsets[i], true);
    bytes.set(names[i], offset + CENTRAL_HEADER_BYTES);

    offset += CENTRAL_HEADER_BYTES + names[i].length;
  });

  view.setUint32(offset, 0x06054b50, true); // end of central directory
  // Bytes +4 and +6 (disk numbers) stay zero — single-volume archive.
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralBytes, true);
  view.setUint32(offset + 16, centralStart, true);
  // Byte +20 (comment length) stays zero.

  return bytes;
}
