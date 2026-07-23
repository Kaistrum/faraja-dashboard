import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import { Alert, Badge, Button, Card, Divider, Input, Spinner, Textarea } from "@kaistrum/stratum-ui";
import { Center } from "@/components/ui/Center";
import { Group, Stack } from "@/components/ui/Stack";
import { Text } from "@/components/ui/Text";
import { IconAlertTriangle, IconSearch, IconUserCheck } from "@tabler/icons-react";
import Header from "@/components/Header";
import type { DisasterType, PointFeature, Responder, ZoneFeature } from "@/types";
import { canAssignToResponder, DAMAGE_COLORS, deriveAvailability } from "@/types";

const ResponderMap = dynamic(() => import("@/components/ResponderMap"), { ssr: false });

interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: string;
}

interface SuggestionResponse {
	access: number;
	debris: number;
	misc: number;
	misc_label: string;
	reasoning: string;
}

function buildZoneFromPoints(zoneId: string, pts: PointFeature[]): ZoneFeature {
	const count = pts.length;
	const casualties = pts.reduce((s, pt) => s + (pt.properties.casualties ?? 0), 0);
	const pct_critical = count > 0 ? pts.filter((pt) => pt.properties.damage_level === "Critical").length / count : 0;
	const pct_partial = count > 0 ? pts.filter((pt) => pt.properties.damage_level === "Medium").length / count : 0;
	const pct_low = count > 0 ? pts.filter((pt) => pt.properties.damage_level === "Low").length / count : 0;
	const score = Math.min(100, Math.round(pct_critical * 60 + (casualties / count) * 40));
	const tier: ZoneFeature["properties"]["tier"] = score >= 70 ? "Critical" : score >= 40 ? "Medium" : "Low";
	const disasterTally: Partial<Record<DisasterType, number>> = {};
	for (const pt of pts) {
		disasterTally[pt.properties.disaster_type] = (disasterTally[pt.properties.disaster_type] ?? 0) + 1;
	}
	const dominant_disaster = (
		Object.entries(disasterTally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Hurricane"
	) as DisasterType;
	const lats = pts.map((pt) => pt.geometry.coordinates[1]);
	const lngs = pts.map((pt) => pt.geometry.coordinates[0]);
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

const AVAILABILITY_STYLES = {
	available: { bg: "var(--success-faint)", color: "var(--success)" },
	busy: { bg: "var(--warning-faint)", color: "var(--warning)" },
	full: { bg: "var(--danger-faint)", color: "var(--danger)" },
	offline: { bg: "var(--bg-card)", color: "var(--text-muted)" },
} as const;

const AVATAR_CHIP =
	"h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold";
const AVATAR_CHIP_SM =
	"h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0";
const AVATAR_CHIP_XS =
	"h-6 w-6 rounded-full flex items-center justify-center shrink-0";
const AVATAR_CHIP_STYLE = { background: "var(--bg-card)", color: "var(--text-dim)" } as const;

// ── Priority computation ────────────────────────────────────────────────────────

interface GlobalWeights { damage: number; time: number; exposure: number }
interface Thresholds { low: number; crit: number }

function computePriority(
	point: PointFeature | null,
	zone: ZoneFeature | null,
	gw: GlobalWeights,
	th: Thresholds,
	accessWeight: number,
	debrisWeight: number,
	casualtiesWeight: number,
	miscWeight: number,
): "Low" | "Medium" | "Critical" {
	if (!zone && !point) return "Low";

	// ── Component scores (0-100) ───────────────────────────────────────────────
	const damageScore = point
		? ({ Critical: 100, Medium: 50, Low: 10 } as Record<string, number>)[
				point.properties.damage_level
		  ] ?? 10
		: Math.round((zone?.properties.pct_critical ?? 0) * 100);

	const casualtyCount = point?.properties.casualties ?? zone?.properties.casualties ?? 0;
	const casualtyScore = Math.min(100, casualtyCount * 8); // caps at ~12 casualties

	const timeScore = 50; // neutral placeholder — no per-point timestamp in view

	// ── Weighted global base ───────────────────────────────────────────────────
	const T = gw.damage + gw.time + gw.exposure || 100;
	const globalScore =
		damageScore * (gw.damage / T) +
		timeScore * (gw.time / T) +
		casualtyScore * (gw.exposure / T);

	// ── On-the-fly session boosts (additive, each up to their cap) ────────────
	//   access    → higher difficulty raises urgency (up to +15 pts)
	//   debris    → debris burden boosts priority (up to +10 pts)
	//   casualties → weight × actual normalised count (up to +20 pts)
	//   misc      → custom factor (up to +10 pts)
	const sessionBoost =
		(accessWeight / 100) * 15 +
		(debrisWeight / 100) * 10 +
		(casualtiesWeight / 100) * (casualtyScore / 100) * 20 +
		(miscWeight / 100) * 10;

	const finalScore = Math.min(100, Math.max(0, globalScore + sessionBoost));

	if (finalScore >= th.crit) return "Critical";
	if (finalScore >= th.low) return "Medium";
	return "Low";
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RespondersPage() {
	const router = useRouter();
	const [user, setUser] = useState<AuthUser | null>(null);
	const [checking, setChecking] = useState(true);
	const [responders, setResponders] = useState<Responder[]>([]);
	const [responderQuery, setResponderQuery] = useState("");
	const [selectedResponder, setSelectedResponder] = useState<Responder | null>(null);
	const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
	const [zoneData, setZoneData] = useState<ZoneFeature | null>(null);
	const [priority, setPriority] = useState<"Low" | "Medium" | "Critical">("Low");
	const [instructions, setInstructions] = useState("");
	const [notification, setNotification] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [loadingZone, setLoadingZone] = useState(false);

	// On-the-fly session weights
	const [accessWeight, setAccessWeight] = useState(20);
	const [debrisWeight, setDebrisWeight] = useState(10);
	const [casualtiesWeight, setCasualtiesWeight] = useState(25);
	const [miscWeight, setMiscWeight] = useState(5);
	const [miscLabel, setMiscLabel] = useState("Flood risk");
	const [aiPrompt, setAiPrompt] = useState("");
	const [suggestion, setSuggestion] = useState<SuggestionResponse | null>(null);
	const [aiLoading, setAiLoading] = useState(false);
	const [savingWeights, setSavingWeights] = useState(false);
	const [weightNotification, setWeightNotification] = useState<string | null>(null);

	// Global weights + thresholds (synced from scoring page via localStorage)
	const [globalWeights, setGlobalWeights] = useState<GlobalWeights>({ damage: 45, time: 35, exposure: 20 });
	const [thresholds, setThresholds] = useState<Thresholds>({ low: 40, crit: 70 });

	// Point context (when arriving from a specific report)
	const [pointData, setPointData] = useState<PointFeature | null>(null);

	const totalWeight = useMemo(
		() => 100 + accessWeight + debrisWeight + casualtiesWeight + miscWeight,
		[accessWeight, debrisWeight, casualtiesWeight, miscWeight],
	);

	// ── Auth ────────────────────────────────────────────────────────────────────
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

	// ── Load global weights + thresholds from scoring page ─────────────────────
	useEffect(() => {
		try {
			const gw = localStorage.getItem("rapida_global_weights");
			if (gw) setGlobalWeights(JSON.parse(gw) as GlobalWeights);
			const th = localStorage.getItem("rapida_thresholds");
			if (th) setThresholds(JSON.parse(th) as Thresholds);
		} catch {
			// ignore
		}
	}, []);

	// ── Responders list ─────────────────────────────────────────────────────────
	useEffect(() => {
		const fetchResponders = async () => {
			try {
				const res = await fetch("/api/responders");
				if (res.ok) setResponders((await res.json()) as Responder[]);
			} catch {
				// ignore
			}
		};
		fetchResponders();
	}, []);

	// ── Zone from URL param ─────────────────────────────────────────────────────
	useEffect(() => {
		if (!router.isReady) return;
		const rawZone = router.query.zone;
		if (typeof rawZone === "string") setSelectedZoneId(rawZone);
	}, [router.isReady, router.query.zone]);

	// Build ZoneFeature from cluster points
	useEffect(() => {
		if (!selectedZoneId) {
			setZoneData(null);
			return;
		}
		let mounted = true;
		const loadZone = async () => {
			setLoadingZone(true);
			try {
				const res = await fetch("/api/clusters");
				if (res.ok) {
					const data = await res.json();
					const allPoints = (data.points ?? []) as PointFeature[];
					const zonePoints = allPoints.filter(
						(pt) => pt.properties.zone_id === selectedZoneId,
					);
					if (mounted && zonePoints.length > 0) {
						setZoneData(buildZoneFromPoints(selectedZoneId, zonePoints));
					}
				}
			} catch {
				// ignore
			} finally {
				if (mounted) setLoadingZone(false);
			}
		};
		loadZone();
		return () => { mounted = false; };
	}, [selectedZoneId]);

	// Fetch specific point when ?point query param is present
	useEffect(() => {
		if (!router.isReady) return;
		const rawPoint = router.query.point;
		if (typeof rawPoint !== "string") {
			setPointData(null);
			return;
		}
		const fetchPoint = async () => {
			try {
				const res = await fetch("/api/clusters");
				if (res.ok) {
					const data = await res.json();
					const pts = (data.points ?? []) as PointFeature[];
					const match = pts.find((pt) => pt.properties.point_id === rawPoint);
					setPointData(match ?? null);
				}
			} catch {
				// ignore
			}
		};
		fetchPoint();
	}, [router.isReady, router.query.point]);

	// ── Computed priority (from weights + point/zone data) ─────────────────────
	const computedPriority = useMemo(
		() =>
			computePriority(
				pointData,
				zoneData,
				globalWeights,
				thresholds,
				accessWeight,
				debrisWeight,
				casualtiesWeight,
				miscWeight,
			),
		[pointData, zoneData, globalWeights, thresholds, accessWeight, debrisWeight, casualtiesWeight, miscWeight],
	);

	// Auto-set the priority field whenever the computed value changes
	useEffect(() => {
		setPriority(computedPriority);
	}, [computedPriority]);

	// ── AI weight suggestion ────────────────────────────────────────────────────
	const handleAskAI = async () => {
		if (!aiPrompt.trim()) return;
		setAiLoading(true);
		try {
			const res = await fetch("/api/ai/suggest-weights", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: aiPrompt }),
			});
			if (res.ok) setSuggestion((await res.json()) as SuggestionResponse);
		} catch {
			// ignore
		} finally {
			setAiLoading(false);
		}
	};

	const handleSaveWeights = async () => {
		setSavingWeights(true);
		try {
			const res = await fetch("/api/scoring/session", { method: "POST" });
			if (res.ok) {
				const data = await res.json();
				localStorage.setItem("active_session_id", data.session_id as string);
				setWeightNotification("Weights saved — priority scores update on next map refresh");
			}
		} catch {
			// ignore
		} finally {
			setSavingWeights(false);
		}
	};

	const handleAssign = async () => {
		if (!selectedZoneId || !selectedResponder) return;
		const eligibility = responderEligibility.get(selectedResponder.id);
		if (eligibility && !eligibility.eligible) return;

		setSaving(true);
		try {
			const pointParam = router.query.point;
			const res = await fetch("/api/tasks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					zone_id: selectedZoneId,
					point_id: typeof pointParam === "string" ? pointParam : undefined,
					responder_id: selectedResponder.id,
					priority,
					instructions,
				}),
			});
			if (res.ok) {
				const data = await res.json();
				if (data.success) {
					setNotification(`Task assigned to ${selectedResponder.name}`);
					setResponders((prev) =>
						prev.map((r) =>
							r.id === selectedResponder.id
								? { ...r, status: "busy" as const, current_task_zone: selectedZoneId, active_task_count: r.active_task_count + 1 }
								: r,
						),
					);
					setInstructions("");
					setSelectedResponder((prev) =>
						prev ? { ...prev, status: "busy" as const, current_task_zone: selectedZoneId, active_task_count: prev.active_task_count + 1 } : prev,
					);
				}
			}
		} catch {
			// ignore
		} finally {
			setSaving(false);
		}
	};

	// ── Derived values ──────────────────────────────────────────────────────────
	const zoneLat = zoneData ? zoneData.geometry.coordinates[1] : null;
	const zoneLng = zoneData ? zoneData.geometry.coordinates[0] : null;

	const responderEligibility = useMemo(() => {
		const map = new Map<string, ReturnType<typeof canAssignToResponder>>();
		if (zoneLat === null || zoneLng === null) return map;
		for (const r of responders) map.set(r.id, canAssignToResponder(r, zoneLat, zoneLng));
		return map;
	}, [responders, zoneLat, zoneLng]);

	const sortedResponders = useMemo(() => {
		if (!zoneData || zoneLat === null || zoneLng === null) {
			const order = { available: 0, busy: 1, full: 2, offline: 3 };
			return [...responders].sort((a, b) => {
				return (order[deriveAvailability(a)] ?? 99) - (order[deriveAvailability(b)] ?? 99);
			});
		}
		return [...responders].sort((a, b) => {
			const aInfo = responderEligibility.get(a.id) ?? { eligible: false, distanceKm: null };
			const bInfo = responderEligibility.get(b.id) ?? { eligible: false, distanceKm: null };
			if (aInfo.eligible && !bInfo.eligible) return -1;
			if (!aInfo.eligible && bInfo.eligible) return 1;
			return (aInfo.distanceKm ?? Infinity) - (bInfo.distanceKm ?? Infinity);
		});
	}, [responders, zoneData, zoneLat, zoneLng, responderEligibility]);

	const selectedResponderEligibility = selectedResponder
		? responderEligibility.get(selectedResponder.id) ?? null
		: null;

	const visibleResponders = useMemo(() => {
		const needle = responderQuery.trim().toLowerCase();
		if (!needle) return sortedResponders;
		return sortedResponders.filter(
			(r) => r.name.toLowerCase().includes(needle) || r.team.toLowerCase().includes(needle),
		);
	}, [sortedResponders, responderQuery]);

	const handleMapSelect = (responder: Responder) => {
		const info = responderEligibility.get(responder.id);
		if (!info || info.eligible) setSelectedResponder(responder);
	};

	const assignButtonDisabled =
		!selectedResponder ||
		!zoneData ||
		(selectedResponderEligibility !== null && !selectedResponderEligibility.eligible);

	const selectedResponderCard = useMemo(() => {
		if (!selectedResponder) {
			return <Text size="sm" c="dimmed">Select a responder from the list</Text>;
		}
		const avail = deriveAvailability(selectedResponder);
		const availStyle = AVAILABILITY_STYLES[avail];
		const availLabel =
			avail === "busy" ? `Busy (${selectedResponder.active_task_count}/5)`
			: avail === "full" ? "Full (5/5)"
			: avail === "offline" ? "Offline"
			: "Available";
		return (
			<Card surface="surface" padding="standard">
				<Group align="center" gap="md">
					<div className={AVATAR_CHIP} style={AVATAR_CHIP_STYLE}>
						{selectedResponder.name.split(" ").map((p) => p[0]).join("")}
					</div>
					<div>
						<Text fw={600}>{selectedResponder.name}</Text>
						<Text size="xs" c="dimmed">{selectedResponder.team}</Text>
					</div>
				</Group>
				<Badge style={{ backgroundColor: availStyle.bg, color: availStyle.color, border: 0 }} className="mt-2">
					{availLabel}
				</Badge>
				{selectedResponder.current_task_zone && (
					<Text size="xs" c="dimmed" mt="sm">Current task: {selectedResponder.current_task_zone}</Text>
				)}
			</Card>
		);
	}, [selectedResponder]);

	if (checking || !user) {
		return (
			<Center style={{ height: "100vh" }}>
				<Spinner />
			</Center>
		);
	}

	// Priority colour helpers
	const PRIORITY_COLOR = { Critical: "var(--danger)", Medium: "var(--warning)", Low: "var(--success)" };
	const PRIORITY_SOFT = { Critical: "var(--danger-faint)", Medium: "var(--warning-faint)", Low: "var(--success-faint)" };
	const pointCasualties = pointData?.properties.casualties ?? zoneData?.properties.casualties ?? null;

	return (
		<div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
			<Header user={user} />
			<div className="flex flex-1 overflow-hidden p-4 gap-4">

				{/* ── Left: responder list (top) + map (bottom) ───────────────────── */}
				<div className="w-[55%] flex flex-col overflow-hidden gap-3">

					{/* Upper: search + compact responder list */}
					<div className="flex flex-col overflow-hidden" style={{ height: "50%" }}>
						<div className="flex items-center justify-between mb-2" style={{ flexShrink: 0 }}>
							<Text fw={700} size="lg" style={{ color: "var(--text)" }}>Responders</Text>
							<Badge>{visibleResponders.length}</Badge>
						</div>
						<Input
							value={responderQuery}
							onChange={(e) => setResponderQuery(e.target.value)}
							placeholder="Search by name or team..."
							leadingIcon={<IconSearch size={14} />}
							style={{ flexShrink: 0, marginBottom: 8 }}
						/>
						<div className="overflow-auto" style={{ flex: 1, minHeight: 0 }}>
							<Stack gap={4}>
								{visibleResponders.map((responder) => {
									const avail = deriveAvailability(responder);
									const availStyle = AVAILABILITY_STYLES[avail];
									const availLabel =
										avail === "busy" ? `Busy (${responder.active_task_count}/5)`
										: avail === "full" ? "Full (5/5)"
										: avail === "offline" ? "Offline"
										: "Available";
									const eligInfo = responderEligibility.get(responder.id) ?? null;
									const isIneligible = eligInfo !== null && !eligInfo.eligible;
									const isSelected = selectedResponder?.id === responder.id;
									const initials = responder.name.split(" ").map((p) => p[0]).join("");
									return (
										<Card
											key={responder.id}
											surface="surface"
											padding="none"
											title={isIneligible ? eligInfo?.reason : undefined}
											style={{
												cursor: isIneligible ? "not-allowed" : "pointer",
												opacity: isIneligible ? 0.5 : 1,
												padding: "6px 10px",
												borderLeft: !isIneligible && avail === "available" ? "3px solid var(--success)" : undefined,
												border: isSelected && !isIneligible ? "2px solid var(--accent)" : undefined,
											}}
											onClick={() => { if (!isIneligible) setSelectedResponder(responder); }}
										>
											<Group align="center" gap="xs">
												<div className={AVATAR_CHIP_XS} style={{ ...AVATAR_CHIP_STYLE, fontSize: 9, fontWeight: 700 }}>{initials}</div>
												<div style={{ flex: 1, minWidth: 0 }}>
													<Text fw={500} size="sm" truncate style={{ lineHeight: 1.25 }}>{responder.name}</Text>
													<Text size="xs" c="dimmed" truncate style={{ lineHeight: 1.2 }}>{responder.team}</Text>
												</div>
												<Stack gap={2} align="flex-end">
													<Badge style={{ backgroundColor: availStyle.bg, color: availStyle.color, border: 0 }}>
														{availLabel}
													</Badge>
													{eligInfo !== null && (
														<Badge
															style={
																eligInfo.eligible
																	? { backgroundColor: "var(--accent-faint)", color: "var(--accent-strong)", border: 0 }
																	: { backgroundColor: "var(--bg-card)", color: "var(--text-muted)", border: 0 }
															}
														>
															{eligInfo.eligible
																? `${eligInfo.distanceKm!.toFixed(1)} km away`
																: eligInfo.reason}
														</Badge>
													)}
												</Stack>
											</Group>
										</Card>
									);
								})}
								{visibleResponders.length === 0 && (
									<Text size="sm" c="dimmed" ta="center" mt="md">No responders match your search</Text>
								)}
							</Stack>
						</div>
					</div>

					{/* Lower: responder + incident map */}
					<div style={{ flex: 1, minHeight: 0, border: "1px solid var(--border)", overflow: "hidden" }}>
						<ResponderMap
							responders={visibleResponders}
							selectedResponder={selectedResponder}
							zoneData={zoneData}
							onSelectResponder={handleMapSelect}
						/>
					</div>
				</div>

				{/* ── Right: weights + assignment ─────────────────────────────────── */}
				<div className="w-[45%] overflow-auto space-y-4">

					{/* Session Priority Weights */}
					<Card surface="surface" padding="standard">
						<Group justify="space-between" mb="xs">
							<Text fw={700} size="sm">On-the-fly Priority Weights</Text>
							<Badge
								style={{
									background: totalWeight > 100 ? "var(--danger-faint)" : "var(--success-faint)",
									color: totalWeight > 100 ? "var(--danger)" : "var(--success)",
									border: 0,
								}}
							>
								{totalWeight}%{totalWeight > 100 ? " — normalised on save" : ""}
							</Badge>
						</Group>
						<Text size="xs" c="dimmed" mb="md">
							These session modifiers stack on top of the global score set on the Weighting
							page (Damage {globalWeights.damage}% · Time {globalWeights.time}% · Exposure {globalWeights.exposure}%).
						</Text>
						<Stack gap="md">
							<Input
								label="Miscellaneous factor label"
								placeholder="e.g. Flood risk"
								value={miscLabel}
								onChange={(e) => setMiscLabel(e.target.value)}
							/>

							{/* Access */}
							<SessionSlider
								label="Access difficulty"
								value={accessWeight}
								onChange={setAccessWeight}
								hint="Hard-to-reach sites raise urgency — factor in road damage, distance, and hazards."
							/>

							{/* Debris */}
							<div>
								<SessionSlider
									label="Presence of debris"
									value={debrisWeight}
									onChange={setDebrisWeight}
								/>
								<Alert variant="warning" icon={<IconAlertTriangle size={16} />} className="mt-2">
									High debris weight can overshadow zones with casualties but less visible debris.
								</Alert>
							</div>

							{/* Casualties — now an on-the-fly factor */}
							<div>
								<div style={{ display: "flex", justifyContent: "space-between" }} className="mb-1">
									<Text size="sm" fw={600}>Casualties weight</Text>
									<Text size="sm" c="dimmed">{casualtiesWeight}%</Text>
								</div>
								<input
									type="range" min={0} max={100} step={1}
									value={casualtiesWeight}
									onChange={(e) => setCasualtiesWeight(Number(e.target.value))}
									className="w-full"
								/>
								{/* Live read-out from the selected point */}
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginTop: 6,
										padding: "6px 10px",
										background: "var(--bg-card)",
										border: "1px solid var(--border)",
									}}
								>
									<Text size="xs" c="dimmed">
										{pointData
											? "Casualties at this incident:"
											: zoneData
												? "Casualties in this zone:"
												: "Casualties (select a point for live value):"}
									</Text>
									<Text
										size="xs"
										fw={700}
										style={{
											color:
												(pointCasualties ?? 0) >= 5
													? "var(--danger)"
													: (pointCasualties ?? 0) >= 1
														? "var(--warning)"
														: "var(--text-muted)",
										}}
									>
										{pointCasualties !== null
											? pointCasualties > 0
												? `${pointCasualties} reported`
												: "None reported"
											: "—"}
									</Text>
								</div>
								<Text size="xs" c="dimmed" mt={4}>
									Moves the computed priority toward Critical proportionally to the casualty count and this weight.
								</Text>
							</div>

							{/* Misc */}
							<SessionSlider
								label={miscLabel || "Miscellaneous"}
								value={miscWeight}
								onChange={setMiscWeight}
							/>

							<Divider label="AI weight suggestion" />
							<Textarea
								label="Describe the crisis to get AI weight suggestions"
								rows={3}
								value={aiPrompt}
								onChange={(e) => setAiPrompt(e.target.value)}
							/>
							<Button size="sm" onClick={handleAskAI} loading={aiLoading}>
								Ask AI for suggestions
							</Button>
							{suggestion && (
								<Card surface="surface" padding="compact">
									<Text fw={600} size="xs" mb="xs">Suggested values</Text>
									<Text size="xs" mb="xs">{suggestion.reasoning}</Text>
									<div className="grid grid-cols-3 gap-2 mb-2">
										<Badge variant="outline">Access {suggestion.access}%</Badge>
										<Badge variant="outline">Debris {suggestion.debris}%</Badge>
										<Badge variant="outline">{suggestion.misc_label} {suggestion.misc}%</Badge>
									</div>
									<Group gap="xs">
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setAccessWeight(suggestion.access);
												setDebrisWeight(suggestion.debris);
												setMiscWeight(suggestion.misc);
												setMiscLabel(suggestion.misc_label);
											}}
										>
											Apply
										</Button>
										<Button size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
											Dismiss
										</Button>
									</Group>
								</Card>
							)}

							<Button size="sm" loading={savingWeights} onClick={handleSaveWeights}>
								Save weights to session
							</Button>
							{weightNotification && (
								<Alert title="Saved" variant="success">{weightNotification}</Alert>
							)}
						</Stack>
					</Card>

					{/* Zone assignment */}
					{!selectedZoneId ? (
						<Card surface="surface" padding="spacious">
							<div className="flex flex-col items-center text-center gap-3">
								<Text c="dimmed" size="sm">Select a zone from the map to assign a task</Text>
								<Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
									Go to map →
								</Button>
							</div>
						</Card>
					) : (
						<Stack gap="md">
							{/* Zone summary */}
							<Card surface="surface" padding="standard">
								<Text fw={600} size="sm" mb="sm">Zone summary</Text>
								{loadingZone ? (
									<Center><Spinner size={16} /></Center>
								) : zoneData ? (
									<Stack gap="xs">
										<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
											<Text fw={700}>{zoneData.properties.zone_id}</Text>
											<Badge style={{ backgroundColor: DAMAGE_COLORS[zoneData.properties.tier], color: "#fff", border: 0 }}>
												{zoneData.properties.tier}
											</Badge>
										</div>
										<Text size="xs" c="dimmed">{zoneData.properties.label}</Text>
										<div style={{ display: "flex", gap: 20 }}>
											<div>
												<Text size="xs" c="dimmed">Reports</Text>
												<Text fw={600} size="sm">{zoneData.properties.count}</Text>
											</div>
											<div>
												<Text size="xs" c="dimmed">Casualties</Text>
												<Text fw={600} size="sm" style={{ color: "var(--danger)" }}>
													{zoneData.properties.casualties}
												</Text>
											</div>
											<div>
												<Text size="xs" c="dimmed">Score</Text>
												<Text fw={600} size="sm">{zoneData.properties.score}</Text>
											</div>
										</div>
									</Stack>
								) : (
									<Text size="sm" c="dimmed">Zone data unavailable</Text>
								)}
							</Card>

							{/* Point of interest */}
							{pointData && (
								<Card surface="surface" padding="standard">
									<Text fw={600} size="xs" c="dimmed" tt="uppercase" mb="xs" style={{ letterSpacing: "0.04em" }}>
										Point of interest
									</Text>
									<Text fw={600} size="sm" mb={6}>{pointData.properties.infrastructure_name}</Text>
									<Group gap="xs" mb={6}>
										<Badge style={{ backgroundColor: DAMAGE_COLORS[pointData.properties.damage_level], color: "#fff", border: 0 }}>
											{pointData.properties.damage_level}
										</Badge>
										<Badge
											style={
												pointData.properties.task_status === "unassigned"
													? { backgroundColor: "var(--danger-faint)", color: "var(--danger)", border: 0 }
													: pointData.properties.task_status === "assigned"
														? { backgroundColor: "var(--accent-faint)", color: "var(--accent-strong)", border: 0 }
														: { backgroundColor: "var(--success-faint)", color: "var(--success)", border: 0 }
											}
										>
											{pointData.properties.task_status}
										</Badge>
									</Group>
									{pointData.properties.casualties > 0 && (
										<Text size="xs" style={{ color: "var(--warning)" }} mb={4} className="flex items-center gap-1">
											<IconAlertTriangle size={12} stroke={2.2} />{" "}
											{pointData.properties.casualties}{" "}
											{pointData.properties.casualties === 1 ? "casualty" : "casualties"} reported
										</Text>
									)}
									<Text size="xs" c="dimmed">Assigning task for this specific report</Text>
								</Card>
							)}

							{selectedResponderCard}

							{/* Assignment panel */}
							<Card surface="surface" padding="standard">
								<Text size="sm" fw={600} mb="sm">Assignment</Text>

								{/* Computed priority (from weights) */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										marginBottom: 10,
										padding: "8px 12px",
										background: PRIORITY_SOFT[computedPriority],
										border: `1px solid ${PRIORITY_COLOR[computedPriority]}30`,
									}}
								>
									<Group gap={6}>
										<IconUserCheck size={14} color={PRIORITY_COLOR[computedPriority]} />
										<Text size="xs" fw={600} style={{ color: PRIORITY_COLOR[computedPriority] }}>
											Computed priority
										</Text>
									</Group>
									<Badge style={{ background: PRIORITY_COLOR[computedPriority], color: "#fff", border: 0 }}>
										{computedPriority}
									</Badge>
								</div>

								<Text size="xs" c="dimmed" mb="xs">Override priority</Text>
								<Group gap="xs" mb="md">
									{(["Low", "Medium", "Critical"] as const).map((level) => {
										const c = PRIORITY_COLOR[level];
										const active = priority === level;
										return (
											<Button
												key={level}
												size="sm"
												variant="outline"
												onClick={() => setPriority(level)}
												style={{
													background: active ? c : "transparent",
													color: active ? "#fff" : c,
													borderColor: c,
												}}
											>
												{level}
											</Button>
										);
									})}
								</Group>
								{priority !== computedPriority && (
									<Text size="xs" c="dimmed" mb="xs">
										⚠ Override active — weights suggest{" "}
										<strong style={{ color: PRIORITY_COLOR[computedPriority] }}>
											{computedPriority}
										</strong>
									</Text>
								)}

								<Textarea
									label="Instructions"
									rows={4}
									value={instructions}
									onChange={(e) => setInstructions(e.target.value)}
									wrapperClassName="mb-4"
								/>
								<Button
									fullWidth
									loading={saving}
									onClick={handleAssign}
									disabled={assignButtonDisabled}
								>
									Assign task
								</Button>
								{selectedResponder &&
									selectedResponderEligibility !== null &&
									!selectedResponderEligibility.eligible && (
										<Text size="xs" style={{ color: "var(--danger)" }} mt="xs">
											{selectedResponderEligibility.reason}
										</Text>
									)}
								{notification && (
									<Alert title="Success" variant="success" className="mt-3">{notification}</Alert>
								)}
							</Card>
						</Stack>
					)}
				</div>
			</div>
		</div>
	);
}

// ── SessionSlider atom ─────────────────────────────────────────────────────────

function SessionSlider({
	label,
	value,
	onChange,
	hint,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	hint?: string;
}) {
	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between" }} className="mb-1">
				<Text size="sm" fw={600}>{label}</Text>
				<Text size="sm" c="dimmed">{value}%</Text>
			</div>
			<input
				type="range" min={0} max={100} step={1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="w-full"
			/>
			{hint && <Text size="xs" c="dimmed" mt={2}>{hint}</Text>}
		</div>
	);
}
