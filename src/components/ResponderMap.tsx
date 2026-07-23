import { useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Responder, ZoneFeature } from "@/types";
import { DAMAGE_COLORS, deriveAvailability } from "@/types";
import { DISASTER_ICON } from "@/components/icons";

const AVAILABILITY_MARKER_COLOR: Record<string, string> = {
	available: "#059669",
	busy: "#D97706",
	full: "#DC2626",
	offline: "#8d897d",
};

function responderIcon(responder: Responder, selected: boolean): L.DivIcon {
	const color = AVAILABILITY_MARKER_COLOR[deriveAvailability(responder)] ?? "#8d897d";
	const initials = responder.name.split(" ").map((p) => p[0]).join("").slice(0, 2);
	const size = selected ? 32 : 26;
	const ring = selected ? "outline:3px solid var(--text);outline-offset:2px;" : "";
	return L.divIcon({
		className: "",
		html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:${size * 0.38}px;font-weight:700;font-family:sans-serif;${ring}">${initials}</div>`,
		iconSize: [size, size],
		iconAnchor: [size / 2, size / 2],
	});
}

function zoneIcon(zone: ZoneFeature): L.DivIcon {
	const color = DAMAGE_COLORS[zone.properties.tier] ?? "#8d897d";
	const Comp = DISASTER_ICON[zone.properties.dominant_disaster] ?? DISASTER_ICON.Other;
	const glyph = renderToStaticMarkup(<Comp size={17} color="#ffffff" stroke={2.2} />);
	return L.divIcon({
		className: "",
		html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">${glyph}</div>`,
		iconSize: [32, 32],
		iconAnchor: [16, 16],
	});
}

function FitBounds({ points }: { points: [number, number][] }) {
	const map = useMap();
	useEffect(() => {
		if (points.length === 0) return;
		if (points.length === 1) {
			map.setView(points[0], 11);
			return;
		}
		map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 12 });
	}, [map, points]);
	return null;
}

interface ResponderMapProps {
	responders: Responder[];
	selectedResponder: Responder | null;
	zoneData: ZoneFeature | null;
	onSelectResponder?: (responder: Responder) => void;
}

export default function ResponderMap({ responders, selectedResponder, zoneData, onSelectResponder }: ResponderMapProps) {
	const located = responders.filter((r): r is Responder & { lat: number; lng: number } => r.lat != null && r.lng != null);
	const zoneLat = zoneData ? zoneData.geometry.coordinates[1] : null;
	const zoneLng = zoneData ? zoneData.geometry.coordinates[0] : null;

	const boundsPoints: [number, number][] = located.map((r) => [r.lat, r.lng] as [number, number]);
	if (zoneLat != null && zoneLng != null) boundsPoints.push([zoneLat, zoneLng]);

	return (
		<MapContainer
			center={[-0.8, 37.5]}
			zoom={7}
			style={{ height: "100%", width: "100%" }}
			attributionControl={false}
		>
			<TileLayer
				url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
				subdomains="abcd"
			/>
			<FitBounds points={boundsPoints} />

			{zoneLat != null && zoneLng != null && zoneData && (
				<Marker position={[zoneLat, zoneLng]} icon={zoneIcon(zoneData)}>
					<Popup minWidth={200}>
						<div style={{ fontSize: 13 }}>
							<div style={{ fontWeight: 700, marginBottom: 4 }}>{zoneData.properties.label}</div>
							<div style={{ marginBottom: 2 }}>
								<strong>{zoneData.properties.tier}</strong> severity · {zoneData.properties.dominant_disaster}
							</div>
							<div style={{ color: "#666" }}>
								{zoneData.properties.count} report{zoneData.properties.count === 1 ? "" : "s"}
								{zoneData.properties.casualties > 0 ? ` · ${zoneData.properties.casualties} casualties` : ""}
							</div>
						</div>
					</Popup>
				</Marker>
			)}

			{located.map((r) => (
				<Marker
					key={r.id}
					position={[r.lat, r.lng]}
					icon={responderIcon(r, selectedResponder?.id === r.id)}
					eventHandlers={onSelectResponder ? { click: () => onSelectResponder(r) } : undefined}
				/>
			))}
		</MapContainer>
	);
}
