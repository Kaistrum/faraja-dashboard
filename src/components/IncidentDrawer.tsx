import { useRouter } from "next/router";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge, Button } from "@kaistrum/stratum-ui";
import { Group, Stack } from "@/components/ui/Stack";
import { Text } from "@/components/ui/Text";
import { IconX, IconArrowRight, IconAlertTriangle } from "@tabler/icons-react";
import { DISASTER_ICON, DisasterGlyph } from "@/components/icons";
import type { DisasterType, PointFeature, TaskStatus } from "@/types";
import { DAMAGE_COLORS, DISASTER_COLORS } from "@/types";

const STATUS_STYLES: Record<TaskStatus, { label: string; bg: string; color: string }> = {
	assigned: { label: "Assigned", bg: "var(--accent-faint)", color: "var(--accent-strong)" },
	unassigned: { label: "Unassigned", bg: "var(--danger-faint)", color: "var(--danger)" },
	resolved: { label: "Resolved", bg: "var(--success-faint)", color: "var(--success)" },
};

/** Pin = severity colour (urgency) + crisis glyph (type) — matches the main map's markers. */
function pinIcon(color: string, disasterType: DisasterType): L.DivIcon {
	const Comp = DISASTER_ICON[disasterType] ?? DISASTER_ICON.Other;
	const glyph = renderToStaticMarkup(<Comp size={16} color="#ffffff" stroke={2.2} />);
	return L.divIcon({
		className: "",
		html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">${glyph}</div>`,
		iconSize: [30, 30],
		iconAnchor: [15, 15],
	});
}

interface IncidentDrawerProps {
	point: PointFeature;
	onClose: () => void;
}

export default function IncidentDrawer({ point, onClose }: IncidentDrawerProps) {
	const router = useRouter();
	const props = point.properties;
	const [lng, lat] = point.geometry.coordinates;
	const damageColor = DAMAGE_COLORS[props.damage_level];
	const statusStyle = STATUS_STYLES[props.task_status];

	const goAssign = () => {
		router.push(`/responders?zone=${props.zone_id}&point=${props.point_id}`);
	};

	return (
		<>
			<div
				onClick={onClose}
				style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1400 }}
			/>
			<div
				className="anim-rise"
				style={{
					position: "fixed",
					top: 0,
					right: 0,
					height: "100vh",
					width: 420,
					maxWidth: "92vw",
					background: "var(--bg-surface)",
					borderLeft: "1px solid var(--border)",
					zIndex: 1401,
					display: "flex",
					flexDirection: "column",
					boxShadow: "-8px 0 28px rgba(0,0,0,0.22)",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "14px 16px",
						borderBottom: "1px solid var(--border)",
						flexShrink: 0,
					}}
				>
					<Text fw={700} size="md" truncate style={{ paddingRight: 8 }}>
						{props.infrastructure_name}
					</Text>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close incident detail"
						style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}
					>
						<IconX size={18} />
					</button>
				</div>

				<div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
					<Stack gap="md">
						<div style={{ height: 180, border: "1px solid var(--border)", overflow: "hidden" }}>
							<MapContainer
								center={[lat, lng]}
								zoom={10}
								dragging={false}
								scrollWheelZoom={false}
								doubleClickZoom={false}
								zoomControl={false}
								attributionControl={false}
								style={{ height: "100%", width: "100%" }}
							>
								<TileLayer
									url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
									subdomains="abcd"
								/>
								<Marker position={[lat, lng]} icon={pinIcon(damageColor, props.disaster_type)} />
							</MapContainer>
						</div>

						<Group gap="xs" wrap="wrap">
							<Badge
								variant="neutral"
								icon={<DisasterGlyph type={props.disaster_type} size={12} />}
								style={{ backgroundColor: DISASTER_COLORS[props.disaster_type], color: "#fff", border: 0 }}
							>
								{props.disaster_type}
							</Badge>
							<Badge style={{ backgroundColor: damageColor, color: "#fff", border: 0 }}>
								{props.damage_level}
							</Badge>
							<Badge style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, border: 0 }}>
								{statusStyle.label}
							</Badge>
						</Group>

						{props.casualties > 0 && (
							<Group gap={6} style={{ color: "var(--danger)" }}>
								<IconAlertTriangle size={14} />
								<Text size="sm" fw={600}>
									{props.casualties} {props.casualties === 1 ? "casualty" : "casualties"}
								</Text>
							</Group>
						)}

						<div>
							<Text size="xs" c="dimmed">Summary</Text>
							<Text size="sm" mt={2}>{props.report_summary}</Text>
						</div>

						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
							<div>
								<Text size="xs" c="dimmed">Infrastructure type</Text>
								<Text size="sm" fw={500}>{props.infrastructure_type}</Text>
							</div>
							<div>
								<Text size="xs" c="dimmed">Zone</Text>
								<Text size="sm" fw={500}>{props.zone_id}</Text>
							</div>
							<div style={{ gridColumn: "1 / -1" }}>
								<Text size="xs" c="dimmed">Assigned to</Text>
								<Text size="sm" fw={500}>{props.assigned_to ?? "Unassigned"}</Text>
							</div>
						</div>

						{props.task_status === "resolved" ? (
							<Text size="sm" c="dimmed">Resolved — no action needed</Text>
						) : (
							<Button fullWidth onClick={goAssign}>
								{props.assigned ? "Reassign" : "Assign to responder"}
								<IconArrowRight size={15} className="ml-1.5" />
							</Button>
						)}
					</Stack>
				</div>
			</div>
		</>
	);
}
