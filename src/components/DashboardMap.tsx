import { useEffect, useRef, useState, useCallback } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { Badge, Button, useTheme } from "@kaistrum/stratum-ui";
import { Text } from "@/components/ui/Text";
import { Stack } from "@/components/ui/Stack";
import { Popover } from "@/components/ui/Popover";
import { IconArrowRight, IconFileText, IconStack2, IconChevronDown, IconMap, IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/router";
import type { ZoneFeature, PointFeature, DisasterType, DamageLevel } from "@/types";
import { DAMAGE_COLORS, formatAiLabel } from "@/types";
import { DISASTER_ICON, DisasterGlyph, FarajaMark } from "@/components/icons";

const LEGEND_DISASTERS: DisasterType[] = [
	"Flood", "Fire", "Chemical", "Landslide", "Earthquake",
	"Hurricane", "Cyclone", "Tsunami", "Civil Unrest", "Conflict", "Other",
];

interface Basemap {
	id: string;
	label: string;
	url: string;
	subdomains: string;
	attribution: string;
	swatch: string;
}

const CARTO_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const BASEMAPS: Basemap[] = [
	{ id: "voyager", label: "Voyager", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", subdomains: "abcd", attribution: CARTO_ATTR, swatch: "#eae6dc" },
	{ id: "light", label: "Minimal", url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", subdomains: "abcd", attribution: CARTO_ATTR, swatch: "#f5f5f3" },
	{ id: "dark", label: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", subdomains: "abcd", attribution: CARTO_ATTR, swatch: "#1b1b1f" },
	{ id: "streets", label: "Streets", url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", subdomains: "abc", attribution: OSM_ATTR, swatch: "#dfe3d4" },
];

function BasemapControl({ value, onChange }: { value: string; onChange: (id: string) => void }) {
	return (
		<div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000 }}>
			<Popover position="right-start">
				<Popover.Target>
					<button
						aria-label="Switch basemap"
						className="flex items-center justify-center transition-colors duration-150 hover:bg-bg-card"
						style={{
							width: 32,
							height: 32,
							border: "1px solid var(--border)",
							background: "var(--bg-surface)",
							color: "var(--text-dim)",
							cursor: "pointer",
							boxShadow: "var(--shadow-sm)",
						}}
					>
						<IconMap size={17} />
					</button>
				</Popover.Target>
				<Popover.Dropdown p={6} style={{ minWidth: 168 }}>
					<Text className="section-label" px={6} pt={2} pb={4}>Basemap</Text>
					<Stack gap={2}>
						{BASEMAPS.map((b) => {
							const isActive = b.id === value;
							return (
								<button
									key={b.id}
									onClick={() => onChange(b.id)}
									className="flex items-center gap-2.5 transition-colors duration-150"
									style={{
										width: "100%",
										padding: "7px 8px",
										border: "none",
										background: isActive ? "var(--bg-card)" : "transparent",
										cursor: "pointer",
										fontSize: 13,
										fontWeight: isActive ? 600 : 500,
										color: "var(--text)",
									}}
								>
									<span style={{ width: 18, height: 18, background: b.swatch, border: "1px solid var(--border-strong)", flexShrink: 0 }} />
									<span style={{ flex: 1, textAlign: "left" }}>{b.label}</span>
									{isActive && <IconCheck size={14} color="var(--accent)" />}
								</button>
							);
						})}
					</Stack>
				</Popover.Dropdown>
			</Popover>
		</div>
	);
}

function disasterSvg(type: DisasterType, size: number): string {
	const Comp = DISASTER_ICON[type] ?? DISASTER_ICON.Other;
	return renderToStaticMarkup(<Comp size={size} color="#ffffff" stroke={2.2} />);
}

/** Pin = severity colour (urgency) + crisis glyph (type). */
function createPointIcon(damageLevel: DamageLevel, disasterType: DisasterType, selected: boolean): L.DivIcon {
	const color = DAMAGE_COLORS[damageLevel] ?? "#8d897d";
	const size = selected ? 38 : 30;
	const glyph = disasterSvg(disasterType, Math.round(size * 0.5));
	const ring = selected ? "outline:3px solid var(--text);outline-offset:2px;" : "";
	return L.divIcon({
		className: "",
		html: `<div class="crisis-pin" style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid var(--bg-surface);box-shadow:0 3px 8px rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;${ring}">${glyph}</div>`,
		iconSize: [size, size] as [number, number],
		iconAnchor: [size / 2, size / 2] as [number, number],
	});
}

/** Cluster as a severity donut — the ring shows the critical/medium/low mix at a glance. */
function createClusterIcon(count: number, crit: number, med: number, low: number): L.DivIcon {
	const total = crit + med + low || count || 1;
	const r = Math.max(20, Math.min(42, Math.sqrt(count) * 5.2));
	const d = r * 2;
	const th = Math.max(5, r * 0.26);
	const ringR = r - th / 2 - 1.5;
	const C = 2 * Math.PI * ringR;
	const fs = Math.max(12, Math.min(18, r / 2.1));
	const segs: [number, string][] = [
		[crit, DAMAGE_COLORS.Critical],
		[med, DAMAGE_COLORS.Medium],
		[low, DAMAGE_COLORS.Low],
	];
	let offset = 0;
	let arcs = "";
	for (const [val, color] of segs) {
		if (val <= 0) continue;
		const len = (val / total) * C;
		arcs += `<circle cx="${r}" cy="${r}" r="${ringR}" fill="none" stroke="${color}" stroke-width="${th}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${r} ${r})" />`;
		offset += len;
	}
	const html = `<div style="filter:drop-shadow(0 3px 8px rgba(0,0,0,0.26));width:${d}px;height:${d}px;">
		<svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
			<circle cx="${r}" cy="${r}" r="${ringR}" fill="none" stroke="var(--bg-card)" stroke-width="${th}" />
			${arcs}
			<circle cx="${r}" cy="${r}" r="${ringR - th / 2}" fill="var(--bg-surface)" />
			<text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central" font-family="Exodus,DMSans,sans-serif" font-weight="700" font-size="${fs}" fill="var(--text)">${Math.round(count)}</text>
		</svg></div>`;
	return L.divIcon({
		className: "",
		html,
		iconSize: [d, d] as [number, number],
		iconAnchor: [r, r] as [number, number],
	});
}

function MapLegendControl() {
	return (
		<div style={{ position: "absolute", bottom: 28, left: 12, zIndex: 1000 }}>
			<Popover position="top-start">
				<Popover.Target>
					<button
						className="flex items-center gap-2 transition-colors duration-150 hover:bg-bg-card"
						style={{
							height: 34,
							padding: "0 12px",
							border: "1px solid var(--border)",
							background: "var(--bg-surface)",
							color: "var(--text)",
							cursor: "pointer",
							fontSize: 12.5,
							fontWeight: 600,
							boxShadow: "var(--shadow-sm)",
						}}
					>
						<IconStack2 size={15} color="var(--text-dim)" />
						Legend
						<IconChevronDown size={13} color="var(--text-muted)" />
					</button>
				</Popover.Target>
				<Popover.Dropdown p="sm" style={{ minWidth: 178 }}>
					<Text className="section-label" mb={6}>Crisis type</Text>
					<Stack gap={6}>
						{LEGEND_DISASTERS.map((type) => (
							<div key={type} style={{ display: "flex", alignItems: "center", gap: 9 }}>
								<span style={{ color: "var(--text-dim)", display: "inline-flex" }}>
									<DisasterGlyph type={type} size={15} stroke={2} />
								</span>
								<Text size="xs">{type}</Text>
							</div>
						))}
					</Stack>
					<Text className="section-label" mt={11} mb={6}>Severity</Text>
					<Stack gap={6}>
						{(Object.entries(DAMAGE_COLORS) as [DamageLevel, string][]).map(([level, color]) => (
							<div key={level} style={{ display: "flex", alignItems: "center", gap: 9 }}>
								<span style={{ width: 11, height: 11, borderRadius: "50%", background: color, flexShrink: 0, border: "1.5px solid var(--bg-surface)", boxShadow: "0 0 0 1px var(--border)" }} />
								<Text size="xs">{level}</Text>
							</div>
						))}
					</Stack>
				</Popover.Dropdown>
			</Popover>
		</div>
	);
}

type PointFeatureExtended = PointFeature & {
	properties: PointFeature["properties"] & {
		casualties: number;
		assigned: boolean;
		assigned_to: string | null;
	};
};

function buildZoneFeature(zoneId: string, points: PointFeatureExtended[]): ZoneFeature {
	const count = points.length;
	const casualties = points.reduce((sum, pt) => sum + pt.properties.casualties, 0);
	const pct_critical = count ? points.filter((pt) => pt.properties.damage_level === "Critical").length / count : 0;
	const pct_partial = count ? points.filter((pt) => pt.properties.damage_level === "Medium").length / count : 0;
	const pct_low = count ? points.filter((pt) => pt.properties.damage_level === "Low").length / count : 0;
	const score = Math.min(100, Math.round(pct_critical * 60 + (casualties / count) * 40));
	const tier: ZoneFeature["properties"]["tier"] = score >= 70 ? "Critical" : score >= 40 ? "Medium" : "Low";

	const disasterTally: Partial<Record<DisasterType, number>> = {};
	for (const pt of points) {
		disasterTally[pt.properties.disaster_type] = (disasterTally[pt.properties.disaster_type] ?? 0) + 1;
	}
	const dominant_disaster = (Object.entries(disasterTally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Other") as DisasterType;
	const lats = points.map((pt) => pt.geometry.coordinates[1]);
	const lngs = points.map((pt) => pt.geometry.coordinates[0]);
	const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
	const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;

	return {
		type: "Feature",
		geometry: { type: "Point", coordinates: [avgLng, avgLat] },
		properties: {
			zone_id: zoneId,
			label: `Zone ${zoneId}`,
			count,
			casualties,
			pct_critical,
			pct_partial,
			pct_low,
			score,
			tier,
			dominant: tier.toLowerCase() as "critical" | "medium" | "low",
			dominant_disaster,
			disaster_breakdown: disasterTally,
		},
	};
}

export interface MapSelection {
	cluster: ZoneFeature | null;
	point: PointFeature | null;
}

function FlyToPoint({ lat, lng }: { lat: number; lng: number }) {
	const map = useMap();
	useEffect(() => {
		map.flyTo([lat, lng], 17, { duration: 1 });
	}, [lat, lng, map]);
	return null;
}

interface DashboardMapProps {
	onSelect: (selection: MapSelection) => void;
	onVisibleZonesChange?: (zones: ZoneFeature[]) => void;
	onVisiblePointsChange?: (points: PointFeature[]) => void;
	flyTo?: { lat: number; lng: number; seq: number } | null;
	onViewReport?: (point: PointFeature) => void;
}

// ── ViewportTracker — emits visible points whenever the map moves/zooms ─────────
function ViewportTracker({
	allPoints,
	onChange,
}: {
	allPoints: PointFeatureExtended[];
	onChange: (points: PointFeatureExtended[]) => void;
}) {
	const map = useMap();

	const emit = useCallback(() => {
		try {
			const bounds = map.getBounds();
			const visible = allPoints.filter((pt) => {
				const [lng, lat] = pt.geometry.coordinates;
				return bounds.contains([lat, lng]);
			});
			onChange(visible);
		} catch {
			// Map bounds not ready yet
		}
	}, [map, allPoints, onChange]);

	useMapEvents({ moveend: emit, zoomend: emit });

	useEffect(() => {
		// Small delay lets the map finish its initial render before we read bounds
		const t = setTimeout(emit, 150);
		return () => clearTimeout(t);
	}, [emit]);

	return null;
}

// ── PhotoInPopup — lazy-fetches the photo for a single open popup ──────────────
function PhotoInPopup({
	reportId,
	name,
	onExpand,
}: {
	reportId: string;
	name: string;
	onExpand: (url: string) => void;
}) {
	const [state, setState] = useState<"loading" | string | null>("loading");

	useEffect(() => {
		let mounted = true;
		fetch(`/api/photo/${reportId}`)
			.then((r) => (r.ok ? (r.json() as Promise<{ photo_url?: string | null }>) : null))
			.then((d) => { if (mounted) setState(d?.photo_url ?? null); })
			.catch(() => { if (mounted) setState(null); });
		return () => { mounted = false; };
	}, [reportId]);

	if (state === "loading") {
		return (
			<div
				style={{
					height: 110,
					background: "var(--bg-card)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: 11,
					color: "var(--text-muted)",
				}}
			>
				Loading photo…
			</div>
		);
	}
	if (!state) return null;
	return (
		<div style={{ marginTop: 2 }}>
			<button
				type="button"
				aria-label={`Expand photo for ${name}`}
				onClick={(e) => {
					e.stopPropagation();
					L.DomEvent.stopPropagation(e.nativeEvent);
					onExpand(state);
				}}
				style={{
					width: "100%",
					padding: 0,
					border: "1px solid var(--border)",
					background: "transparent",
					cursor: "zoom-in",
					display: "block",
					overflow: "hidden",
				}}
			>
				<img
					src={state}
					alt={name}
					onError={(e) => { (e.currentTarget as HTMLImageElement).closest("button")!.style.display = "none"; }}
					style={{
						width: "100%",
						height: 130,
						objectFit: "cover",
						display: "block",
					}}
				/>
				<div style={{ fontSize: 10, color: "var(--text-muted)", padding: "3px 6px 4px", textAlign: "right" }}>
					Click to expand ↗
				</div>
			</button>
		</div>
	);
}

export default function DashboardMap({ onSelect, onVisibleZonesChange, onVisiblePointsChange, flyTo, onViewReport }: DashboardMapProps) {
	const router = useRouter();
	const { theme } = useTheme();
	const [basemapId, setBasemapId] = useState<string | null>(null);
	const [points, setPoints] = useState<PointFeatureExtended[]>([]);
	const pointsMapRef = useRef<Map<string, PointFeatureExtended>>(new Map());
	// Signature of the last rendered points — lets the 10s poll skip re-rendering
	// (and remounting markers) when nothing that affects the map has changed.
	const pointsSigRef = useRef<string>("");
	const [openPopupId, setOpenPopupId] = useState<string | null>(null);
	const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

	const openLightbox = useCallback((url: string, name: string) => setLightbox({ url, name }), []);

	// Close lightbox on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	useEffect(() => {
		let controller = new AbortController();

		async function loadPoints() {
			try {
				const res = await fetch("/api/clusters", { signal: controller.signal });
				if (!res.ok) return;
				const data = (await res.json()) as { points?: PointFeatureExtended[] };
				const fetchedPoints = data.points ?? [];

				// Bail out of the state update when the poll returned equivalent data.
				// Replacing `points` with fresh object references remounts every
				// marker, which closes/reopens (flickers) any open popup.
				const signature = fetchedPoints
					.map((pt) => {
						const p = pt.properties;
						const [lng, lat] = pt.geometry.coordinates;
						return `${p.point_id}|${p.damage_level}|${p.disaster_type}|${p.task_status}|${p.assigned_to ?? ""}|${lng},${lat}`;
					})
					.join(";");
				if (signature === pointsSigRef.current) return;
				pointsSigRef.current = signature;

				setPoints(fetchedPoints);
				pointsMapRef.current = new Map(fetchedPoints.map((pt) => [pt.properties.point_id, pt]));

				const zoneMap = new Map<string, PointFeatureExtended[]>();
				for (const pt of fetchedPoints) {
					const existing = zoneMap.get(pt.properties.zone_id) ?? [];
					existing.push(pt);
					zoneMap.set(pt.properties.zone_id, existing);
				}

				const derivedZones: ZoneFeature[] = Array.from(zoneMap.entries()).map(([zid, pts]) => buildZoneFeature(zid, pts));
				onVisibleZonesChange?.(derivedZones);
			} catch (err) {
				if ((err as DOMException)?.name === "AbortError") return;
				console.error(err);
			}
		}

		loadPoints();
		// Poll so responder status changes (accepted/resolved) show up on the
		// map without a manual refresh — there is no push/realtime channel.
		const interval = setInterval(() => {
			controller = new AbortController();
			loadPoints();
		}, 10_000);
		return () => {
			clearInterval(interval);
			controller.abort();
		};
	}, [onVisibleZonesChange]);

	const iconCreateFunction = (cluster: any) => {
		const count = cluster.getChildCount();
		const children = cluster.getAllChildMarkers();
		let crit = 0;
		let med = 0;
		let low = 0;
		for (const marker of children) {
			const dl = (marker.options as L.MarkerOptions & { alt?: string }).alt;
			if (dl === "Critical") crit++;
			else if (dl === "Medium") med++;
			else low++;
		}
		return createClusterIcon(count, crit, med, low);
	};

	const handleClusterClick = (event: any) => {
		const cluster = event.cluster ?? event.layer;
		if (!cluster?.getAllChildMarkers) {
			onSelect({ cluster: null, point: null });
			return;
		}
		const childMarkers = cluster.getAllChildMarkers();
		const childPoints = childMarkers
			.map((marker: any) => pointsMapRef.current.get(marker.options?.title))
			.filter(Boolean) as PointFeatureExtended[];
		if (childPoints.length === 0) {
			onSelect({ cluster: null, point: null });
			return;
		}
		const syntheticZone = buildZoneFeature("CLUSTER", childPoints);
		onSelect({ cluster: syntheticZone, point: null });
	};

	const handlePointClick = (pt: PointFeatureExtended) => {
		const zonePoints = points.filter((item) => item.properties.zone_id === pt.properties.zone_id);
		const parentZone = buildZoneFeature(pt.properties.zone_id, zonePoints);
		onSelect({ cluster: parentZone, point: pt });
	};

	// Defaults to the theme's basemap until the user explicitly picks one.
	const activeBasemap =
		BASEMAPS.find((b) => b.id === (basemapId ?? (theme === "dark" ? "dark" : "voyager"))) ?? BASEMAPS[0];

	return (
		<div style={{ position: "relative", width: "100%", height: "100%" }}>
			<MapLegendControl />
			<BasemapControl value={activeBasemap.id} onChange={setBasemapId} />

			{/* ── Fullscreen photo lightbox ─────────────────────────────────── */}
			{lightbox && (
				<div
					role="dialog"
					aria-modal="true"
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,0.93)",
						zIndex: 99999,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						cursor: "zoom-out",
					}}
					onClick={() => setLightbox(null)}
				>
					{/* Close button */}
					<button
						aria-label="Close photo"
						style={{
							position: "absolute",
							top: 16,
							right: 20,
							background: "rgba(255,255,255,0.12)",
							border: "1px solid rgba(255,255,255,0.25)",
							color: "#fff",
							padding: "6px 16px",
							cursor: "pointer",
							fontSize: 13,
							fontWeight: 600,
							zIndex: 1,
						}}
						onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
					>
						✕ Close
					</button>

					{/* Image + caption — stop click from propagating to backdrop */}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 14,
							maxWidth: "92vw",
							maxHeight: "92vh",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<img
							src={lightbox.url}
							alt={lightbox.name}
							style={{
								display: "block",
								maxWidth: "92vw",
								maxHeight: "82vh",
								objectFit: "contain",
								boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
							}}
						/>
						<div
							style={{
								color: "rgba(255,255,255,0.75)",
								fontSize: 13,
								fontWeight: 500,
								letterSpacing: 0.2,
								textAlign: "center",
							}}
						>
							{lightbox.name}
						</div>
					</div>
				</div>
			)}
			<MapContainer center={[-0.8, 37.5]} zoom={8} maxZoom={19} style={{ height: "100%", width: "100%" }}>
				<TileLayer
					key={activeBasemap.id}
					url={activeBasemap.url}
					subdomains={activeBasemap.subdomains}
					attribution={activeBasemap.attribution}
					maxZoom={19}
				/>
				{onVisiblePointsChange && (
					<ViewportTracker allPoints={points} onChange={onVisiblePointsChange} />
				)}
				{flyTo && <FlyToPoint key={flyTo.seq} lat={flyTo.lat} lng={flyTo.lng} />}
				<MarkerClusterGroup
					iconCreateFunction={iconCreateFunction}
					chunkedLoading
					showCoverageOnHover={false}
					animate
					animateAddingMarkers={false}
					maxClusterRadius={220}
					spiderfyOnMaxZoom
					disableClusteringAtZoom={18}
					eventHandlers={{ clusterclick: handleClusterClick } as any}
				>
					{points.map((pt) => {
						const [lng, lat] = pt.geometry.coordinates;
						const damageColor = DAMAGE_COLORS[pt.properties.damage_level] ?? "#8d897d";
						return (
							<Marker
								key={pt.properties.point_id}
								position={[lat, lng]}
								icon={createPointIcon(pt.properties.damage_level, pt.properties.disaster_type, false)}
								alt={pt.properties.damage_level}
								title={pt.properties.point_id}
								eventHandlers={{
									click: () => handlePointClick(pt),
									popupopen: () => setOpenPopupId(pt.properties.point_id),
									popupclose: () => setOpenPopupId((prev) => (prev === pt.properties.point_id ? null : prev)),
								}}
							>
								<Popup minWidth={260}>
									<Stack gap={8}>
										{/* Photo thumbnail — loaded lazily when popup opens */}
										{openPopupId === pt.properties.point_id && pt.properties.original_report_id && (
											<PhotoInPopup
												reportId={pt.properties.original_report_id}
												name={pt.properties.infrastructure_name}
												onExpand={(url) => openLightbox(url, pt.properties.infrastructure_name)}
											/>
										)}

										<Text fw={700} size="sm">{pt.properties.infrastructure_name}</Text>
										<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
											<Badge
												variant="neutral"
												icon={<DisasterGlyph type={pt.properties.disaster_type} size={12} stroke={2} />}
											>
												{pt.properties.disaster_type}
											</Badge>
											<Badge style={{ backgroundColor: damageColor, color: "#fff", border: 0 }}>
												{pt.properties.damage_level}
											</Badge>
										</div>
										<div>
											<Text size="xs" c="dimmed">Infrastructure type</Text>
											<Text size="xs" fw={500}>{pt.properties.infrastructure_type}</Text>
										</div>
										{(pt.properties.ai_disaster_type || pt.properties.ai_damage_severity) && (
											<div style={{ background: "var(--bg-card)", padding: "6px 8px" }}>
												<div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
													<FarajaMark size={14} />
													<Text size="xs" fw={700}>Faraja's assessment</Text>
												</div>
												<Text size="xs" c="dimmed">
													{[formatAiLabel(pt.properties.ai_disaster_type), formatAiLabel(pt.properties.ai_damage_severity)]
														.filter(Boolean)
														.join(" · ")}
												</Text>
											</div>
										)}
										{pt.properties.assigned ? (
											<Badge style={{ backgroundColor: "var(--success-faint)", color: "var(--success)", border: 0 }}>
												Assigned to {pt.properties.assigned_to}
											</Badge>
										) : (
											<>
												<Badge style={{ backgroundColor: "var(--danger-faint)", color: "var(--danger)", border: 0 }}>
													Not assigned
												</Badge>
												<Button
													size="sm"
													fullWidth
													className="mt-1.5"
													onClick={() => router.push(`/responders?zone=${pt.properties.zone_id}`)}
												>
													Assign
													<IconArrowRight size={14} className="ml-1.5" />
												</Button>
											</>
										)}
										{onViewReport && (
											<Button size="sm" fullWidth variant="outline" icon={<IconFileText size={14} />} onClick={() => onViewReport(pt)}>
												View full report
											</Button>
										)}
									</Stack>
								</Popup>
							</Marker>
						);
					})}
				</MarkerClusterGroup>
			</MapContainer>
		</div>
	);
}
