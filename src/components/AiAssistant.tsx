import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton, Textarea } from "@kaistrum/stratum-ui";
import { Text } from "@/components/ui/Text";
import {
	IconX,
	IconArrowUp,
	IconChartBar,
	IconAlertTriangle,
	IconClipboardList,
	IconBolt,
	IconMapPin,
	IconUserPlus,
	IconAdjustmentsHorizontal,
} from "@tabler/icons-react";
import type { PointFeature, TaskAssignment, DisasterType, ZoneFeature, DamageLevel } from "@/types";
import { DAMAGE_WEIGHT } from "@/types";
import { FarajaMark } from "@/components/icons";

const FARAJA_BASE = (process.env.NEXT_PUBLIC_FARAJA_API_URL || "").replace(/\/+$/, "");

/* ============================== Types ============================== */

interface FarajaAction {
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
}

interface FarajaMessage {
	id: string;
	role: "faraja" | "user";
	lines: string[];
	actions?: FarajaAction[];
}

type IntentHint = "summary" | "critical_zones" | "unassigned" | "deploy" | "weighting" | "freeform";

interface ApiAction {
	type: "fly_to" | "assign" | "apply_thresholds";
	label: string;
	lat?: number;
	lng?: number;
	zone_id?: string;
	low?: number;
	crit?: number;
}

interface ApiResponse {
	lines: string[];
	actions?: ApiAction[];
	meta?: { intent?: IntentHint; grounded?: boolean };
}

interface AiAssistantProps {
	opened: boolean;
	onClose: () => void;
	points: PointFeature[];
	assignments: TaskAssignment[];
	zones?: ZoneFeature[];
	thresholds?: { low: number; crit: number };
	onFlyTo?: (lat: number, lng: number) => void;
	onAssign?: (zoneId: string) => void;
	onApplyThresholds?: (low: number, crit: number) => void;
}

function uid() {
	return Math.random().toString(36).slice(2);
}

const QUICK_INTENTS: { q: string; hint: IntentHint }[] = [
	{ q: "Give me a situation summary", hint: "summary" },
	{ q: "Which zones are critical?", hint: "critical_zones" },
	{ q: "What's still unassigned?", hint: "unassigned" },
	{ q: "Who should I deploy next?", hint: "deploy" },
	{ q: "Recommend new thresholds", hint: "weighting" },
];

function buildSituationalGreeting(facts: {
	total: number;
	critical: { properties: { casualties?: number } }[];
	casualties: number;
	unassigned: { length: number }[] | { length: number };
	disasterTally: Partial<Record<DisasterType, number>>;
	zoneCount: number;
}): string[] {
	const hour = new Date().getHours();
	const opener =
		hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

	if (facts.total === 0) {
		return [
			`${opener} I'm Faraja — your response co-pilot.`,
			"The map is quiet in this view. Pan or zoom to bring incidents into range and I'll start reading.",
		];
	}

	const topDisaster = (Object.entries(facts.disasterTally) as [DisasterType, number][])
		.sort((a, b) => b[1] - a[1])[0]?.[0];
	const critN = facts.critical.length;
	const unN = "length" in facts.unassigned ? (facts.unassigned as { length: number }).length : 0;

	const headline = `${opener} I'm Faraja — ${facts.total} report${facts.total === 1 ? "" : "s"} in view across ${facts.zoneCount} zone${facts.zoneCount === 1 ? "" : "s"}.`;

	const detailBits: string[] = [];
	if (critN > 0) detailBits.push(`${critN} critical`);
	if (facts.casualties > 0) detailBits.push(`${facts.casualties} casualt${facts.casualties === 1 ? "y" : "ies"} reported`);
	if (unN > 0) detailBits.push(`${unN} still unassigned`);
	const detail = detailBits.length > 0 ? detailBits.join(" · ") : "all reports currently handled";

	const lead =
		critN > 0
			? `Worst hit is ${topDisaster ?? "the dominant hazard"} damage. Where would you like to start?`
			: topDisaster
				? `Dominant hazard: ${topDisaster}. What would you like to look at?`
				: "What would you like to look at?";

	return [headline, detail + ".", lead];
}

function inferIntent(q: string): IntentHint {
	const t = q.toLowerCase();
	if (/threshold|weight|cutoff|tune|tier|score|recalibrate/.test(t)) return "weighting";
	if (/critical|severe|worst|urgent|priorit/.test(t)) return "critical_zones";
	if (/unassign|pending|not assigned|no responder|needs/.test(t)) return "unassigned";
	if (/deploy|dispatch|who should|send.*to|respond/.test(t)) return "deploy";
	if (/summary|situation|overview|status|brief|happen/.test(t)) return "summary";
	return "freeform";
}

/* ============================== Component ============================== */

export default function AiAssistant({
	opened,
	onClose,
	points,
	assignments,
	zones,
	thresholds,
	onFlyTo,
	onAssign,
	onApplyThresholds,
}: AiAssistantProps) {
	const [messages, setMessages] = useState<FarajaMessage[]>([]);
	const [input, setInput] = useState("");
	const [thinking, setThinking] = useState(false);
	const viewportRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	/* ---------------- Live facts (used by fallback heuristic) ---------------- */

	const facts = useMemo(() => {
		const total = points.length;
		const critical = points.filter((p) => p.properties.damage_level === "Critical");
		const casualties = points.reduce((s, p) => s + (p.properties.casualties ?? 0), 0);
		const unassigned = points.filter((p) => p.properties.task_status === "unassigned");
		const disasterTally: Partial<Record<DisasterType, number>> = {};
		const zoneIds = new Set<string>();
		for (const p of points) {
			disasterTally[p.properties.disaster_type] = (disasterTally[p.properties.disaster_type] ?? 0) + 1;
			zoneIds.add(p.properties.zone_id);
		}
		return { total, critical, casualties, unassigned, disasterTally, zoneCount: zoneIds.size };
	}, [points]);

	const priorityPoints = useMemo(() => {
		return [...points]
			.map((p) => ({
				p,
				score:
					(DAMAGE_WEIGHT[p.properties.damage_level] ?? 1) * 10 +
					(p.properties.casualties ?? 0) * 5 +
					(p.properties.task_status === "unassigned" ? 6 : 0),
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, 3)
			.map((x) => x.p);
	}, [points]);

	/* ---------------- Build the context payload for /api/faraja ---------------- */

	function buildContext() {
		const total = points.length;
		const critCount = points.filter((p) => p.properties.damage_level === "Critical").length;
		const medCount = points.filter((p) => p.properties.damage_level === "Medium").length;
		const lowCount = points.filter((p) => p.properties.damage_level === "Low").length;
		const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

		// Aggregate zones from points if explicit zone features aren't supplied.
		const zoneAgg = new Map<
			string,
			{
				zone_id: string;
				count: number;
				casualties: number;
				tally: Partial<Record<DamageLevel, number>>;
				disasters: Partial<Record<DisasterType, number>>;
			}
		>();
		for (const p of points) {
			const z = p.properties.zone_id;
			let entry = zoneAgg.get(z);
			if (!entry) {
				entry = { zone_id: z, count: 0, casualties: 0, tally: {}, disasters: {} };
				zoneAgg.set(z, entry);
			}
			entry.count += 1;
			entry.casualties += p.properties.casualties ?? 0;
			entry.tally[p.properties.damage_level] = (entry.tally[p.properties.damage_level] ?? 0) + 1;
			entry.disasters[p.properties.disaster_type] = (entry.disasters[p.properties.disaster_type] ?? 0) + 1;
		}

		const zonesPayload =
			zones && zones.length > 0
				? zones.map((z) => ({
						zone_id: z.properties.zone_id,
						count: z.properties.count,
						casualties: z.properties.casualties,
						tier: z.properties.tier,
						dominant_disaster: z.properties.dominant_disaster,
						score: z.properties.score,
					}))
				: Array.from(zoneAgg.values()).map((z) => {
						const dominantDmg: DamageLevel =
							(z.tally.Critical ?? 0) > 0
								? "Critical"
								: (z.tally.Medium ?? 0) > 0
									? "Medium"
									: "Low";
						const dominantDisaster = (Object.entries(z.disasters) as [DisasterType, number][])
							.sort((a, b) => b[1] - a[1])[0]?.[0];
						return {
							zone_id: z.zone_id,
							count: z.count,
							casualties: z.casualties,
							tier: dominantDmg,
							dominant_disaster: dominantDisaster,
						};
					});

		const pointsPayload = points.slice(0, 80).map((p) => {
			const [lng, lat] = p.geometry.coordinates;
			return {
				point_id: p.properties.point_id,
				zone_id: p.properties.zone_id,
				infrastructure_name: p.properties.infrastructure_name,
				infrastructure_type: p.properties.infrastructure_type,
				disaster_type: p.properties.disaster_type,
				damage_level: p.properties.damage_level,
				casualties: p.properties.casualties,
				task_status: p.properties.task_status,
				assigned_to: p.properties.assigned_to,
				lat,
				lng,
			};
		});

		const assignmentsPayload = assignments.slice(0, 40).map((a) => ({
			id: a.id,
			zone_id: a.zone_id,
			point_id: a.point_id,
			responder_name: a.responder_name,
			priority: a.priority,
			status: a.status,
		}));

		return {
			severity: {
				pct_destroyed: pct(critCount),
				pct_partial: pct(medCount),
				pct_minimal: pct(lowCount),
				total_reports: total,
			},
			thresholds: thresholds ?? { low: 40, crit: 70 },
			points: pointsPayload,
			zones: zonesPayload,
			assignments: assignmentsPayload,
		};
	}

	/* ---------------- Map API actions back into UI actions ---------------- */

	function mapApiActions(actions: ApiAction[] | undefined): FarajaAction[] {
		if (!actions) return [];
		const out: FarajaAction[] = [];
		for (const a of actions) {
			if (a.type === "fly_to" && typeof a.lat === "number" && typeof a.lng === "number" && onFlyTo) {
				const lat = a.lat;
				const lng = a.lng;
				out.push({ label: a.label, icon: <IconMapPin size={13} />, onClick: () => onFlyTo(lat, lng) });
			} else if (a.type === "assign" && a.zone_id && onAssign) {
				const zoneId = a.zone_id;
				out.push({ label: a.label, icon: <IconUserPlus size={13} />, onClick: () => onAssign(zoneId) });
			} else if (
				a.type === "apply_thresholds" &&
				typeof a.low === "number" &&
				typeof a.crit === "number" &&
				onApplyThresholds
			) {
				const low = a.low;
				const crit = a.crit;
				out.push({
					label: a.label,
					icon: <IconAdjustmentsHorizontal size={13} />,
					onClick: () => onApplyThresholds(low, crit),
				});
			}
		}
		return out;
	}

	/* ---------------- Send: try API, fall back to local heuristic ---------------- */

	async function send(text: string, hintOverride?: IntentHint) {
		const trimmed = text.trim();
		if (!trimmed || thinking) return;
		setInput("");
		setMessages((prev) => [...prev, { id: uid(), role: "user", lines: [trimmed] }]);
		setThinking(true);

		const intent_hint = hintOverride ?? inferIntent(trimmed);
		const history = messages
			.slice(-6)
			.map((m) => ({ role: m.role, content: m.lines.join("\n") }));

		try {
			if (!FARAJA_BASE) throw new Error("env unset");
			const ctrl = new AbortController();
			const timeout = window.setTimeout(() => ctrl.abort(), 180_000);
			const res = await fetch(`${FARAJA_BASE}/copilot`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					query: trimmed,
					intent_hint,
					history,
					context: buildContext(),
				}),
				signal: ctrl.signal,
			});
			window.clearTimeout(timeout);

			if (!res.ok) throw new Error(`api ${res.status}`);
			const data = (await res.json()) as ApiResponse;
			if (!Array.isArray(data.lines) || data.lines.length === 0) {
				throw new Error("empty lines");
			}
			setMessages((prev) => [
				...prev,
				{ id: uid(), role: "faraja", lines: data.lines, actions: mapApiActions(data.actions) },
			]);
		} catch {
			// Network/timeout/missing config — fall back to the local heuristic so the UI never blocks.
			setMessages((prev) => [...prev, buildLocalReply(trimmed)]);
		} finally {
			setThinking(false);
		}
	}

	/* ---------------- Local heuristic fallback (the previous behaviour) ---------------- */

	const flyAction = (p: PointFeature): FarajaAction => {
		const [lng, lat] = p.geometry.coordinates;
		return {
			label: p.properties.infrastructure_name,
			icon: <IconMapPin size={13} />,
			onClick: () => onFlyTo?.(lat, lng),
		};
	};

	function buildLocalReply(query: string): FarajaMessage {
		const q = query.toLowerCase();
		const id = uid();

		if (facts.total === 0) {
			return {
				id,
				role: "faraja",
				lines: [
					"No reports are currently in view. Pan or zoom the map to bring incidents into range and I'll analyse them.",
				],
			};
		}

		const isCritical = /critical|severe|worst|urgent|priorit/.test(q);
		const isUnassigned = /unassign|pending|not assigned|no responder|needs/.test(q);
		const isResponder = /responder|assign|deploy|team|who/.test(q);
		const isSummary = /summary|situation|overview|status|brief|happen/.test(q);

		if (isCritical) {
			if (facts.critical.length === 0)
				return { id, role: "faraja", lines: ["No critically-damaged sites are in view. The highest severity here is Medium."] };
			const ranked = [...facts.critical]
				.sort((a, b) => (b.properties.casualties ?? 0) - (a.properties.casualties ?? 0))
				.slice(0, 4);
			return {
				id,
				role: "faraja",
				lines: [
					`${facts.critical.length} sites are critically damaged, ranked by casualties:`,
					...ranked.map(
						(p, i) =>
							`${i + 1}.  ${p.properties.infrastructure_name} — Zone ${p.properties.zone_id} · ${p.properties.casualties} casualties · ${p.properties.disaster_type}`
					),
					"Tap a site to centre the map on it.",
				],
				actions: ranked.map(flyAction),
			};
		}

		if (isUnassigned) {
			if (facts.unassigned.length === 0)
				return { id, role: "faraja", lines: ["Every report in view already has a responder assigned. Nothing pending."] };
			const sample = facts.unassigned.slice(0, 4);
			return {
				id,
				role: "faraja",
				lines: [
					`${facts.unassigned.length} reports are unassigned. Most urgent by severity:`,
					...sample.map((p) => `•  ${p.properties.infrastructure_name} — Zone ${p.properties.zone_id} · ${p.properties.damage_level}`),
				],
				actions: sample.slice(0, 1).map((p) => ({
					label: `Assign Zone ${p.properties.zone_id}`,
					icon: <IconUserPlus size={13} />,
					onClick: () => onAssign?.(p.properties.zone_id),
				})),
			};
		}

		if (isResponder) {
			const target = priorityPoints[0];
			if (!target) return { id, role: "faraja", lines: ["No active incidents need a responder right now."] };
			return {
				id,
				role: "faraja",
				lines: [
					`Highest-impact open incident: ${target.properties.infrastructure_name} (Zone ${target.properties.zone_id}).`,
					`It's ${target.properties.damage_level.toLowerCase()}-damage with ${target.properties.casualties} casualties from ${target.properties.disaster_type.toLowerCase()}.`,
					"I'd dispatch your nearest available team here first.",
					"Verify before dispatch.",
				],
				actions: [
					{ label: `Assign Zone ${target.properties.zone_id}`, icon: <IconUserPlus size={13} />, onClick: () => onAssign?.(target.properties.zone_id) },
					flyAction(target),
				],
			};
		}

		if (isSummary || q.length < 4) {
			const topDisasters = (Object.entries(facts.disasterTally) as [string, number][])
				.sort((a, b) => b[1] - a[1])
				.slice(0, 3)
				.map(([d, c]) => `${d} (${c})`)
				.join(", ");
			return {
				id,
				role: "faraja",
				lines: [
					`The current view holds ${facts.total} reports across ${facts.zoneCount} zones.`,
					`•  ${facts.critical.length} critically damaged · ${facts.casualties} reported casualties`,
					`•  ${facts.unassigned.length} reports still await a responder`,
					`•  Dominant hazards: ${topDisasters}`,
					facts.critical.length > 0 ? "I'd start with the critically-damaged sites — shall I pull them up?" : "No critical sites in view — the situation is comparatively stable.",
				],
				actions: priorityPoints.map(flyAction),
			};
		}

		return {
			id,
			role: "faraja",
			lines: [
				"I read the live map for you. Try: a situation summary, the critical zones, what's still unassigned, or who to deploy next.",
			],
		};
	}

	/* ---------------- Effects ---------------- */

	useEffect(() => {
		const vp = viewportRef.current;
		if (vp) vp.scrollTo({ top: vp.scrollHeight, behavior: "smooth" });
	}, [messages, thinking]);

	useEffect(() => {
		if (opened && messages.length === 0) {
			setMessages([
				{
					id: uid(),
					role: "faraja",
					lines: buildSituationalGreeting(facts),
					actions: priorityPoints.slice(0, 2).map(flyAction),
				},
			]);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [opened, messages.length]);

	// Textarea has no built-in autosize — grow/shrink it manually, clamped to 1–4 lines.
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		const lineHeight = 19;
		const maxHeight = lineHeight * 4;
		el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
	}, [input]);

	const suggestions = [
		{ label: "Situation summary", icon: <IconChartBar size={14} />, q: "Give me a situation summary", hint: "summary" as const },
		{ label: "Critical zones", icon: <IconAlertTriangle size={14} />, q: "Which zones are critical?", hint: "critical_zones" as const },
		{ label: "Unassigned reports", icon: <IconClipboardList size={14} />, q: "What's still unassigned?", hint: "unassigned" as const },
		{ label: "Who to deploy", icon: <IconBolt size={14} />, q: "Who should I deploy next?", hint: "deploy" as const },
	];

	return (
		<>
			<div
				onClick={onClose}
				style={{
					position: "fixed",
					inset: 0,
					background: "var(--overlay-bg)",
					zIndex: 1100,
					opacity: opened ? 1 : 0,
					pointerEvents: opened ? "auto" : "none",
					transition: "opacity 0.25s var(--ease-standard)",
				}}
			/>

			<aside
				style={{
					position: "fixed",
					top: 0,
					right: 0,
					bottom: 0,
					width: "min(420px, 92vw)",
					background: "var(--bg-surface)",
					borderLeft: "1px solid var(--border)",
					boxShadow: "var(--shadow-lg)",
					zIndex: 1101,
					display: "flex",
					flexDirection: "column",
					transform: opened ? "translateX(0)" : "translateX(100%)",
					transition: "transform 0.32s var(--ease-standard)",
				}}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-4" style={{ height: 60, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
					<div className="flex items-center gap-2.5">
						<FarajaMark size={36} />
						<div className="leading-tight">
							<Text fw={700} style={{ fontSize: 14.5 }}>Faraja</Text>
							<Text style={{ fontSize: 11, color: "var(--text-muted)" }}>Response assistant</Text>
						</div>
					</div>
					<IconButton variant="ghost" size="md" onClick={onClose} aria-label="Close Faraja" icon={<IconX size={18} />} />
				</div>

				{/* Messages */}
				<div ref={viewportRef} className="overflow-y-auto" style={{ flex: 1 }}>
					<div className="flex flex-col gap-3 p-4">
						{messages.map((m) => (
							<MessageBubble key={m.id} message={m} />
						))}
						{thinking && <TypingBubble />}

						{messages.length <= 1 && !thinking && (
							<div className="flex flex-col gap-2 mt-1 anim-fade">
								{suggestions.map((s) => (
									<button
										key={s.label}
										onClick={() => send(s.q, s.hint)}
										className="flex items-center gap-2.5 transition-colors duration-150 hover:bg-bg-card"
										style={{
											textAlign: "left",
											padding: "10px 12px",
											border: "1px solid var(--border)",
											background: "var(--bg-surface)",
											cursor: "pointer",
											fontSize: 13,
											fontWeight: 500,
											color: "var(--text)",
										}}
									>
										<span style={{ color: "var(--accent)" }}>{s.icon}</span>
										{s.label}
									</button>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Composer */}
				<div className="p-3" style={{ borderTop: "1px solid var(--border)", flexShrink: 0 }}>
					<div className="flex items-end gap-2 p-1.5" style={{ background: "var(--bg-card)" }}>
						<Textarea
							ref={textareaRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									send(input);
								}
							}}
							placeholder="Ask Faraja about the situation…"
							rows={1}
							className="flex-1 resize-none !border-transparent !bg-transparent px-2 py-1.5 text-[13.5px] leading-[1.4]"
							style={{ color: "var(--text)" }}
						/>
						<IconButton
							onClick={() => send(input)}
							disabled={!input.trim() || thinking}
							variant={input.trim() && !thinking ? "accent" : "default"}
							size="md"
							aria-label="Send"
							icon={<IconArrowUp size={18} stroke={2.2} />}
						/>
					</div>
					<Text ta="center" mt={6} style={{ fontSize: 10, color: "var(--text-muted)" }}>
						Faraja reasons over the live map · verify before dispatch
					</Text>
				</div>
			</aside>
		</>
	);
}

function MessageBubble({ message }: { message: FarajaMessage }) {
	const isUser = message.role === "user";
	return (
		<div className={`flex anim-rise ${isUser ? "justify-end" : "justify-start"}`}>
			{!isUser && <FarajaMark size={26} radius={9} />}
			<div style={{ maxWidth: "82%", marginLeft: isUser ? 0 : 8 }}>
				<div
					style={{
						padding: "9px 12px",
						background: isUser ? "var(--accent)" : "var(--bg-card)",
						color: isUser ? "var(--text-on-accent)" : "var(--text)",
						fontSize: 13.2,
						lineHeight: 1.5,
						whiteSpace: "pre-wrap",
					}}
				>
					{message.lines.map((line, i) => (
						<div key={i} style={{ marginTop: i === 0 ? 0 : 3 }}>{line}</div>
					))}
				</div>
				{message.actions && message.actions.length > 0 && (
					<div className="flex flex-wrap gap-1.5 mt-2">
						{message.actions.map((a, i) => (
							<button
								key={i}
								onClick={a.onClick}
								className="flex items-center gap-1.5 transition-colors duration-150 hover:bg-accent-faint"
								style={{
									padding: "5px 10px",
									border: "1px solid var(--border)",
									background: "var(--bg-surface)",
									color: "var(--accent-strong)",
									fontSize: 12,
									fontWeight: 600,
									cursor: "pointer",
									maxWidth: "100%",
								}}
							>
								{a.icon}
								<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function TypingBubble() {
	return (
		<div className="flex justify-start anim-fade">
			<FarajaMark size={26} radius={9} />
			<div className="flex items-center gap-1" style={{ marginLeft: 8, padding: "12px 14px", background: "var(--bg-card)" }}>
				{[0, 1, 2].map((i) => (
					<span
						key={i}
						style={{
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: "var(--text-muted)",
							display: "inline-block",
							animation: "dotFlash 1.1s infinite",
							animationDelay: `${i * 0.16}s`,
						}}
					/>
				))}
			</div>
		</div>
	);
}
