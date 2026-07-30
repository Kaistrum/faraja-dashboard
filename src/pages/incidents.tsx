import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { Alert, Badge, Card, Input, Select, Spinner } from "@kaistrum/stratum-ui";
import { Center } from "@/components/ui/Center";
import { Group } from "@/components/ui/Stack";
import { Menu } from "@/components/ui/Menu";
import { Table } from "@/components/ui/Table";
import { Text } from "@/components/ui/Text";
import { IconSearch, IconArrowUp, IconArrowDown, IconChevronDown, IconDownload } from "@tabler/icons-react";
import Header from "@/components/Header";
import type { DamageLevel, DisasterType, InfrastructureType, PointFeature, TaskStatus } from "@/types";
import { DAMAGE_COLORS, DISASTER_COLORS } from "@/types";
import {
	buildIncidentExport,
	downloadBlob,
	EXPORT_FORMATS,
	toIncidentRows,
	type ExportFormat,
} from "@/lib/incidentExport";

const IncidentDrawer = dynamic(() => import("@/components/IncidentDrawer"), { ssr: false });

interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: string;
}

type CasualtyFilter = "none" | "one-two" | "three-five" | "six-plus";

const COUNTY_BY_ZONE: Record<string, string> = {
	"Z-001": "Nairobi",
	"Z-002": "Nairobi",
	"Z-003": "Nairobi",
	"Z-004": "Nairobi",
	"Z-005": "Nairobi",
	"Z-006": "Machakos",
	"Z-007": "Kiambu",
	"Z-008": "Nairobi",
	"Z-009": "Nairobi",
	"Z-010": "Kiambu",
};

const STATUS_STYLES: Record<TaskStatus, { label: string; bg: string; color: string }> = {
	assigned: { label: "Assigned", bg: "var(--accent-faint)", color: "var(--accent-strong)" },
	unassigned: { label: "Unassigned", bg: "var(--danger-faint)", color: "var(--danger)" },
	resolved: { label: "Resolved", bg: "var(--success-faint)", color: "var(--success)" },
};

const severityOptions: DamageLevel[] = ["Critical", "Medium", "Low"];
const disasterOptions: DisasterType[] = [
	"Chemical",
	"Earthquake",
	"Fire",
	"Flood",
	"Hurricane",
	"Cyclone",
	"Landslide",
	"Tsunami",
	"Civil Unrest",
	"Conflict",
	"Other",
];
const statusOptions: TaskStatus[] = ["assigned", "unassigned", "resolved"];
const casualtyOptions: { value: CasualtyFilter; label: string }[] = [
	{ value: "none", label: "No casualties" },
	{ value: "one-two", label: "1-2 casualties" },
	{ value: "three-five", label: "3-5 casualties" },
	{ value: "six-plus", label: "6+ casualties" },
];

function matchesCasualtyFilter(casualties: number, filter: CasualtyFilter | null) {
	if (!filter) return true;
	if (filter === "none") return casualties === 0;
	if (filter === "one-two") return casualties >= 1 && casualties <= 2;
	if (filter === "three-five") return casualties >= 3 && casualties <= 5;
	return casualties >= 6;
}

function Chip({
	children,
	bg,
	color,
}: {
	children: React.ReactNode;
	bg: string;
	color: string;
}) {
	return (
		<Badge style={{ background: bg, color, border: 0, textTransform: "uppercase", letterSpacing: 0 }}>
			{children}
		</Badge>
	);
}

function countyFor(point: PointFeature) {
	return COUNTY_BY_ZONE[point.properties.zone_id] ?? "Nairobi";
}

function formatDate(iso: string) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function IncidentsPage() {
	const router = useRouter();
	const [user, setUser] = useState<AuthUser | null>(null);
	const [checking, setChecking] = useState(true);
	const [loading, setLoading] = useState(false);
	const [points, setPoints] = useState<PointFeature[]>([]);
	const [query, setQuery] = useState("");
	const [county, setCounty] = useState<string | null>(null);
	const [severity, setSeverity] = useState<DamageLevel | null>(null);
	const [infrastructure, setInfrastructure] = useState<InfrastructureType | null>(null);
	const [casualties, setCasualties] = useState<CasualtyFilter | null>(null);
	const [disasterType, setDisasterType] = useState<DisasterType | null>(null);
	const [status, setStatus] = useState<TaskStatus | null>(null);
	const [selectedIncident, setSelectedIncident] = useState<PointFeature | null>(null);
	const [dateSortDir, setDateSortDir] = useState<"desc" | "asc">("desc");
	const [exportNotice, setExportNotice] = useState<{ variant: "success" | "warning"; message: string } | null>(null);

	useEffect(() => {
		const raw = localStorage.getItem("auth_user");
		if (!raw) {
			router.replace("/signin");
		} else {
			try {
				setUser(JSON.parse(raw) as AuthUser);
			} catch {
				router.replace("/signin");
			}
		}
		setChecking(false);
	}, [router]);

	useEffect(() => {
		let mounted = true;
		const fetchIncidents = async (showSpinner: boolean) => {
			if (showSpinner) setLoading(true);
			try {
				const res = await fetch("/api/clusters");
				if (res.ok) {
					const data = await res.json();
					if (mounted) setPoints((data.points ?? []) as PointFeature[]);
				}
			} catch {
				// keep the table empty if the mock endpoint is unavailable
			} finally {
				if (mounted) setLoading(false);
			}
		};
		fetchIncidents(true);
		// Poll so responder status changes (accepted/resolved) show up here
		// without a manual refresh — there is no push/realtime channel.
		const interval = setInterval(() => fetchIncidents(false), 10_000);
		return () => {
			mounted = false;
			clearInterval(interval);
		};
	}, []);

	const countyOptions = useMemo(
		() => Array.from(new Set(points.map(countyFor))).sort().map((value) => ({ value, label: value })),
		[points]
	);

	const infrastructureOptions = useMemo(
		() =>
			Array.from(new Set(points.map((point) => point.properties.infrastructure_type)))
				.sort()
				.map((value) => ({ value, label: value })),
		[points]
	);

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return points.filter((point) => {
			const props = point.properties;
			const haystack = [
				props.point_id,
				props.infrastructure_name,
				props.infrastructure_type,
				props.disaster_type,
				props.damage_level,
				props.task_status,
				props.assigned_to ?? "",
				props.report_summary,
				countyFor(point),
			]
				.join(" ")
				.toLowerCase();

			return (
				(!needle || haystack.includes(needle)) &&
				(!county || countyFor(point) === county) &&
				(!severity || props.damage_level === severity) &&
				(!infrastructure || props.infrastructure_type === infrastructure) &&
				matchesCasualtyFilter(props.casualties, casualties) &&
				(!disasterType || props.disaster_type === disasterType) &&
				(!status || props.task_status === status)
			);
		});
	}, [points, query, county, severity, infrastructure, casualties, disasterType, status]);

	const sorted = useMemo(() => {
		return [...filtered].sort((a, b) => {
			const da = new Date(a.properties.submitted_at).getTime();
			const db = new Date(b.properties.submitted_at).getTime();
			return dateSortDir === "desc" ? db - da : da - db;
		});
	}, [filtered, dateSortDir]);

	// Exports what the table currently shows — filters and sort included — so
	// the file always matches what the operator is looking at.
	const handleExport = (format: ExportFormat) => {
		const chosen = EXPORT_FORMATS.find((f) => f.value === format);
		try {
			const rows = toIncidentRows(sorted, countyFor);
			const { blob, filename, skipped } = buildIncidentExport(format, rows);
			downloadBlob(blob, filename);
			setExportNotice(
				skipped > 0
					? {
							variant: "warning",
							message: `Exported ${rows.length - skipped} of ${rows.length} incidents as ${chosen?.label}. ${skipped} skipped — a Shapefile point cannot store a missing coordinate.`,
						}
					: {
							variant: "success",
							message: `Exported ${rows.length} ${rows.length === 1 ? "incident" : "incidents"} as ${chosen?.label} (${filename}).`,
						},
			);
		} catch (err) {
			setExportNotice({
				variant: "warning",
				message: `Export failed: ${err instanceof Error ? err.message : "unknown error"}`,
			});
		}
	};

	if (checking || !user) {
		return (
			<Center style={{ height: "100vh" }}>
				<Spinner />
			</Center>
		);
	}

	return (
		<div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
			<Header user={user} />
			<main className="flex-1 overflow-auto">
				<div className="px-5 py-5" style={{ minWidth: 1120 }}>
					<div className="mb-6 flex items-start justify-between gap-4">
						<div>
							<Text fw={700} size="xl" style={{ color: "var(--text)" }}>Incident Reports</Text>
							<Text size="sm" c="dimmed" mt={8}>
								Total incidents: {filtered.length} of {points.length}
							</Text>
						</div>

						<Menu position="bottom-end" width={260}>
							<Menu.Target>
								<button
									type="button"
									disabled={sorted.length === 0}
									className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-bg-card disabled:opacity-50 disabled:cursor-not-allowed"
									style={{ border: "1px solid var(--border)", color: "var(--text)" }}
								>
									<IconDownload size={15} />
									Export
									<IconChevronDown size={14} color="var(--text-muted)" />
								</button>
							</Menu.Target>
							<Menu.Dropdown>
								<Menu.Label>
									Export {sorted.length} filtered {sorted.length === 1 ? "incident" : "incidents"}
								</Menu.Label>
								{/* Menu.Item nests its children inside a <span>, so Text has to
								    render as a span too rather than its default div. */}
								{EXPORT_FORMATS.map((option) => (
									<Menu.Item
										key={option.value}
										onClick={() => handleExport(option.value)}
										rightSection={
											<Text as="span" size="xs" c="dimmed">{option.extension}</Text>
										}
									>
										<span className="flex flex-col leading-tight">
											<span>{option.label}</span>
											<Text as="span" size="xs" c="dimmed">{option.hint}</Text>
										</span>
									</Menu.Item>
								))}
							</Menu.Dropdown>
						</Menu>
					</div>

					{exportNotice && (
						<Alert
							variant={exportNotice.variant}
							title={exportNotice.variant === "success" ? "Export ready" : "Export incomplete"}
							className="mb-4"
						>
							{exportNotice.message}
						</Alert>
					)}

					<div className="space-y-4 mb-5">
						<Input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search by incident ID, location, or description..."
							leadingIcon={<IconSearch size={16} />}
						/>
						<div className="grid grid-cols-6 gap-5">
							<Select
								label="County"
								value={county ?? ""}
								onChange={(e) => setCounty(e.target.value || null)}
								options={[{ value: "", label: "All counties" }, ...countyOptions]}
							/>
							<Select
								label="Severity"
								value={severity ?? ""}
								onChange={(e) => setSeverity((e.target.value || null) as DamageLevel | null)}
								options={[{ value: "", label: "All severity levels" }, ...severityOptions.map((value) => ({ value, label: value }))]}
							/>
							<Select
								label="Infrastructure"
								value={infrastructure ?? ""}
								onChange={(e) => setInfrastructure((e.target.value || null) as InfrastructureType | null)}
								options={[{ value: "", label: "All infrastructure" }, ...infrastructureOptions]}
							/>
							<Select
								label="Casualties"
								value={casualties ?? ""}
								onChange={(e) => setCasualties((e.target.value || null) as CasualtyFilter | null)}
								options={[{ value: "", label: "All casualty ranges" }, ...casualtyOptions]}
							/>
							<Select
								label="Crisis type"
								value={disasterType ?? ""}
								onChange={(e) => setDisasterType((e.target.value || null) as DisasterType | null)}
								options={[{ value: "", label: "All crisis types" }, ...disasterOptions.map((value) => ({ value, label: value }))]}
							/>
							<Select
								label="Status"
								value={status ?? ""}
								onChange={(e) => setStatus((e.target.value || null) as TaskStatus | null)}
								options={[{ value: "", label: "All statuses" }, ...statusOptions.map((value) => ({ value, label: STATUS_STYLES[value].label }))]}
							/>
						</div>
					</div>

					<Card surface="surface" padding="none" style={{ overflow: "hidden" }}>
						<div style={{ maxHeight: "60vh", overflow: "auto" }}>
							<Table>
								<Table.Thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
									<Table.Tr>
										<Table.Th>Location</Table.Th>
										<Table.Th>Infrastructure</Table.Th>
										<Table.Th>County</Table.Th>
										<Table.Th>Crisis type</Table.Th>
										<Table.Th>Severity</Table.Th>
										<Table.Th>Casualties</Table.Th>
										<Table.Th>Assigned To</Table.Th>
										<Table.Th>Status</Table.Th>
										<Table.Th
											onClick={() => setDateSortDir((d) => (d === "desc" ? "asc" : "desc"))}
											style={{ cursor: "pointer", userSelect: "none" }}
										>
											<span className="inline-flex items-center gap-1">
												Date
												{dateSortDir === "desc" ? <IconArrowDown size={12} /> : <IconArrowUp size={12} />}
											</span>
										</Table.Th>
										<Table.Th>Description</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{loading ? (
										<Table.Tr>
											<Table.Td colSpan={10}>
												<Center style={{ padding: "32px 0" }}><Spinner size={18} /></Center>
											</Table.Td>
										</Table.Tr>
									) : sorted.length === 0 ? (
										<Table.Tr>
											<Table.Td colSpan={10}>
												<Text ta="center" c="dimmed" style={{ padding: "32px 0" }}>No incidents match the current filters</Text>
											</Table.Td>
										</Table.Tr>
									) : (
										sorted.map((point) => {
											const props = point.properties;
											const statusStyle = STATUS_STYLES[props.task_status];
											return (
												<Table.Tr
													key={props.point_id}
													onClick={() => setSelectedIncident(point)}
													style={{ cursor: "pointer" }}
												>
													<Table.Td style={{ minWidth: 220 }}>{props.infrastructure_name}</Table.Td>
													<Table.Td>
														<Chip bg="var(--border-strong)" color="var(--text)">
															{props.infrastructure_type as InfrastructureType}
														</Chip>
													</Table.Td>
													<Table.Td>{countyFor(point)}</Table.Td>
													<Table.Td>
														<Chip bg={DISASTER_COLORS[props.disaster_type]} color="#fff">
															{props.disaster_type}
														</Chip>
													</Table.Td>
													<Table.Td>
														<Chip bg={DAMAGE_COLORS[props.damage_level]} color="#fff">
															{props.damage_level}
														</Chip>
													</Table.Td>
													<Table.Td className="tnum">{props.casualties}</Table.Td>
													<Table.Td style={{ minWidth: 140 }}>{props.assigned_to ?? "-"}</Table.Td>
													<Table.Td>
														<Chip bg={statusStyle.bg} color={statusStyle.color}>
															{statusStyle.label}
														</Chip>
													</Table.Td>
													<Table.Td className="tnum" style={{ whiteSpace: "nowrap" }}>{formatDate(props.submitted_at)}</Table.Td>
													<Table.Td style={{ minWidth: 310, maxWidth: 460 }}>
														<Text size="sm" lineClamp={2}>{props.report_summary}</Text>
													</Table.Td>
												</Table.Tr>
											);
										})
									)}
								</Table.Tbody>
							</Table>
						</div>
					</Card>

					<Group gap="xs" mt="sm">
						<Badge variant="neutral">
							{points.filter((p) => p.properties.task_status === "unassigned").length} unassigned
						</Badge>
						<Badge variant="neutral">
							{points.filter((p) => p.properties.damage_level === "Critical").length} critical
						</Badge>
					</Group>
				</div>
			</main>

			{selectedIncident && (
				<IncidentDrawer point={selectedIncident} onClose={() => setSelectedIncident(null)} />
			)}
		</div>
	);
}
