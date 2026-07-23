import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Badge, Button, Card, Divider, Spinner } from "@kaistrum/stratum-ui";
import { Center } from "@/components/ui/Center";
import { Group, Stack } from "@/components/ui/Stack";
import { Text } from "@/components/ui/Text";
import { IconArrowUp, IconInfoCircle, IconBook, IconChartBar } from "@tabler/icons-react";
import Header from "@/components/Header";
import { FarajaMark } from "@/components/icons";
import type { SeveritySummary } from "@/types";

interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: string;
}

interface WeightAdvice {
	low: number;
	crit: number;
	lines: string[];
}

// Scientific references for each global weight factor
const WEIGHT_REFS = [
	{
		key: "damage",
		label: "Damage severity",
		defaultPct: 45,
		color: "var(--danger)",
		desc: "Fraction of infrastructure classified as completely destroyed in the zone",
		guidance:
			"Structural damage state is the primary response trigger in FEMA HAZUS methodology (FEMA P-366) and UN-SPIDER remote-sensing protocols. Completely destroyed buildings concentrate the highest life-safety risk and define the triage front line in every major disaster-response framework.",
		ref: "FEMA P-366 Hazus Technical Manual; UN-SPIDER Recommended Practice on Damage Assessment",
	},
	{
		key: "time",
		label: "Time since last report",
		defaultPct: 35,
		color: "var(--warning)",
		desc: "Recency of the damage intelligence — older reports decay in actionability",
		guidance:
			"SPHERE Humanitarian Standards (2018 edition) establish that life-critical emergency response must mobilise within 24–72 hours. Beyond 72 hours, survivability for structurally trapped persons drops sharply (Coburn & Spence, 2002). INSARAG 2020 guidelines weight time-elapsed as a primary search-and-rescue prioritisation criterion.",
		ref: "SPHERE Handbook 2018; INSARAG Guidelines 2020; Coburn & Spence — Earthquake Protection (2nd ed., 2002)",
	},
	{
		key: "exposure",
		label: "Population exposure",
		defaultPct: 20,
		color: "var(--success)",
		desc: "Estimated number of people at risk within the zone boundary",
		guidance:
			"The UNDRR Sendai Framework for DRR 2015–2030 defines risk as Hazard × Exposure × Vulnerability. Population size scales the absolute harm potential of any damage level. FEMA Risk Assessment Guide (FEMA 452) uses exposure as a damage-consequence multiplier in federal prioritisation models.",
		ref: "UNDRR Sendai Framework 2015–2030; FEMA 452 Risk Assessment Guide",
	},
];

export default function ScoringPage() {
	const router = useRouter();
	const [user, setUser] = useState<AuthUser | null>(null);
	const [checking, setChecking] = useState(true);
	const [severity, setSeverity] = useState<SeveritySummary | null>(null);
	const [loading, setLoading] = useState(false);
	const [advice, setAdvice] = useState<WeightAdvice | null>(null);
	const [advising, setAdvising] = useState(false);

	// Global weight sliders (must sum to 100 — normalised in priority formula)
	const [weightDamage, setWeightDamage] = useState(45);
	const [weightTime, setWeightTime] = useState(35);
	const [weightExposure, setWeightExposure] = useState(20);

	// Score thresholds
	const [lowThreshold, setLowThreshold] = useState(40);
	const [critThreshold, setCritThreshold] = useState(70);

	const weightTotal = weightDamage + weightTime + weightExposure;

	// ── Auth check ──────────────────────────────────────────────────────────────
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

	// ── Load persisted config from localStorage ─────────────────────────────────
	useEffect(() => {
		try {
			const gw = localStorage.getItem("rapida_global_weights");
			if (gw) {
				const parsed = JSON.parse(gw) as { damage?: number; time?: number; exposure?: number };
				if (parsed.damage != null) setWeightDamage(parsed.damage);
				if (parsed.time != null) setWeightTime(parsed.time);
				if (parsed.exposure != null) setWeightExposure(parsed.exposure);
			}
			const th = localStorage.getItem("rapida_thresholds");
			if (th) {
				const parsed = JSON.parse(th) as { low?: number; crit?: number };
				if (parsed.low != null) setLowThreshold(parsed.low);
				if (parsed.crit != null) setCritThreshold(parsed.crit);
			}
		} catch {
			// ignore parse errors
		}
	}, []);

	// ── Persist config changes ──────────────────────────────────────────────────
	useEffect(() => {
		localStorage.setItem(
			"rapida_global_weights",
			JSON.stringify({ damage: weightDamage, time: weightTime, exposure: weightExposure }),
		);
	}, [weightDamage, weightTime, weightExposure]);

	useEffect(() => {
		localStorage.setItem(
			"rapida_thresholds",
			JSON.stringify({ low: lowThreshold, crit: critThreshold }),
		);
	}, [lowThreshold, critThreshold]);

	// ── Severity summary ────────────────────────────────────────────────────────
	useEffect(() => {
		let mounted = true;
		const fetchSummary = async () => {
			setLoading(true);
			try {
				const res = await fetch("/api/stats/severity-summary");
				if (res.ok) {
					const data = (await res.json()) as SeveritySummary;
					if (mounted) setSeverity(data);
				}
			} catch {
				// ignore
			} finally {
				if (mounted) setLoading(false);
			}
		};
		fetchSummary();
		const interval = window.setInterval(fetchSummary, 60_000);
		return () => {
			mounted = false;
			window.clearInterval(interval);
		};
	}, []);

	// ── Faraja threshold advice ─────────────────────────────────────────────────
	const requestAdvice = () => {
		setAdvising(true);
		setAdvice(null);
		window.setTimeout(() => {
			const dest = severity?.pct_destroyed ?? 0;
			const partial = severity?.pct_partial ?? 0;
			const minimal = severity?.pct_minimal ?? 0;
			const total = severity?.total_reports ?? 0;

			const crit = Math.min(85, Math.max(62, Math.round(60 + dest * 0.28)));
			const low = Math.min(crit - 8, Math.max(30, Math.round(30 + minimal * 0.25)));

			const lines = [
				total > 0
					? `Across ${total} reports: ${dest}% destroyed · ${partial}% partial · ${minimal}% minimal.`
					: "No live severity data yet — basing this on sensible defaults.",
				dest >= 50
					? `Severity is concentrated at the top, so I'd keep the Critical tier selective (cutoff ≈ ${crit}) — otherwise too many zones flag critical and responders get spread thin.`
					: dest <= 20
						? `Severely-damaged zones are rare here, so a lower Critical cutoff (≈ ${crit}) surfaces them earlier instead of burying them in Medium.`
						: `Damage is fairly spread out — a Critical cutoff around ${crit} keeps the top tier meaningful.`,
				`I'd set the Low/Medium boundary at ${low} so partial-damage zones read as Medium rather than Low.`,
			];
			setAdvice({ low, crit, lines });
			setAdvising(false);
		}, 620);
	};

	const applyAdvice = () => {
		if (!advice) return;
		setLowThreshold(advice.low);
		setCritThreshold(advice.crit);
	};

	const thresholdSegments = useMemo(
		() => [
			{ w: lowThreshold, c: "var(--success)" },
			{ w: critThreshold - lowThreshold, c: "var(--warning)" },
			{ w: 100 - critThreshold, c: "var(--danger)" },
		],
		[lowThreshold, critThreshold],
	);

	if (checking || !user) {
		return (
			<Center style={{ height: "100vh" }}>
				<Spinner />
			</Center>
		);
	}

	const weightOk = weightTotal === 100;

	return (
		<div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
			<Header user={user} />
			<div className="flex-1 overflow-auto p-4">
				<div className="mx-auto max-w-3xl space-y-5">

					{/* ── Page title ────────────────────────────────────────────────── */}
					<div>
						<Text fw={700} size="xl" style={{ color: "var(--text)" }}>Priority Weighting</Text>
						<Text size="sm" c="dimmed">Configure how zones are scored and triaged into Low / Medium / Critical response tiers.</Text>
					</div>

					{/* ── Explanation ───────────────────────────────────────────────── */}
					<Card surface="surface" padding="spacious" style={{ background: "var(--bg-surface)" }}>
						<Group gap="sm" mb="md">
							<IconInfoCircle size={18} color="var(--accent)" />
							<Text fw={700} size="md" style={{ color: "var(--text)" }}>What is Priority Weighting?</Text>
						</Group>

						<Stack gap="sm">
							<Text size="sm" style={{ lineHeight: 1.65, color: "var(--text-dim)" }}>
								When a crisis produces dozens or hundreds of simultaneous reports, every
								responder deployment has an opportunity cost — resources sent to one site cannot
								reach another. Priority Weighting converts raw damage intelligence into a
								ranked response queue so that limited capacity reaches the highest-need zones
								first.
							</Text>

							<Text size="sm" style={{ lineHeight: 1.65, color: "var(--text-dim)" }}>
								The system computes a <strong style={{ color: "var(--text)" }}>priority score (0 – 100)</strong> for
								each affected zone by combining three global factors (damage severity, time
								sensitivity, and population exposure) with per-session on-the-fly modifiers set
								by the responding team (access difficulty, debris burden, confirmed casualties,
								and a custom factor). Zones are then stratified into{" "}
								<strong style={{ color: "var(--success)" }}>Low</strong>,{" "}
								<strong style={{ color: "var(--warning)" }}>Medium</strong>, or{" "}
								<strong style={{ color: "var(--danger)" }}>Critical</strong> tiers
								using the configurable thresholds below.
							</Text>

							{/* Formula strip */}
							<div
								style={{
									background: "var(--bg-card)",
									border: "1px solid var(--border)",
									padding: "12px 16px",
									fontFamily: "monospace",
									fontSize: 13,
									color: "var(--text-dim)",
									lineHeight: 1.7,
								}}
							>
								<div>Score = (Damage × <em>w₁</em>) + (Time × <em>w₂</em>) + (Exposure × <em>w₃</em>)</div>
								<div style={{ marginTop: 4 }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ Access<sub>adj</sub> + Debris<sub>adj</sub> + Casualties<sub>adj</sub> + Misc<sub>adj</sub></div>
								<div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>w₁ + w₂ + w₃ = 100 (normalised)</div>
							</div>

							<Divider style={{ margin: "2px 0" }} />

							<Group gap="sm" align="start">
								<IconChartBar size={16} color="var(--text-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
								<Text size="sm" style={{ lineHeight: 1.65, color: "var(--text-dim)" }}>
									<strong style={{ color: "var(--text)" }}>How to adjust weights:</strong> Slide
									each bar in the Global Priority Weights section to redistribute the balance
									between damage severity, time sensitivity, and population exposure. The three
									weights must sum to 100 — a warning will appear if they do not. Weights are
									saved instantly to your session and shared with the Responders page. On-the-fly
									modifiers (access, debris, casualties) are adjusted per assignment on the
									Responders page and stack on top of the global score.
								</Text>
							</Group>
						</Stack>
					</Card>

					{/* ── Global weights ────────────────────────────────────────────── */}
					<Card surface="surface" padding="spacious">
						<Group justify="space-between" mb="md">
							<Text fw={700} size="lg" style={{ color: "var(--text)" }}>Global priority weights</Text>
							<Badge
								style={{
									background: weightOk ? "var(--success-faint)" : "var(--danger-faint)",
									color: weightOk ? "var(--success)" : "var(--danger)",
									border: 0,
								}}
							>
								{weightOk ? "Sum = 100%" : `Sum = ${weightTotal}% — adjust to reach 100`}
							</Badge>
						</Group>

						<Text size="xs" c="dimmed" mb="lg">
							Slide each bar to set the relative importance of each factor in the composite zone score.
							Casualties is now an on-the-fly factor on the Responders page, giving field teams
							direct control per incident.
						</Text>

						<Stack gap="xl">
							{/* Damage */}
							<WeightSlider
								label={WEIGHT_REFS[0].label}
								value={weightDamage}
								onChange={setWeightDamage}
								color={WEIGHT_REFS[0].color}
								desc={WEIGHT_REFS[0].desc}
								guidance={WEIGHT_REFS[0].guidance}
								ref_={WEIGHT_REFS[0].ref}
							/>
							{/* Time */}
							<WeightSlider
								label={WEIGHT_REFS[1].label}
								value={weightTime}
								onChange={setWeightTime}
								color={WEIGHT_REFS[1].color}
								desc={WEIGHT_REFS[1].desc}
								guidance={WEIGHT_REFS[1].guidance}
								ref_={WEIGHT_REFS[1].ref}
							/>
							{/* Exposure */}
							<WeightSlider
								label={WEIGHT_REFS[2].label}
								value={weightExposure}
								onChange={setWeightExposure}
								color={WEIGHT_REFS[2].color}
								desc={WEIGHT_REFS[2].desc}
								guidance={WEIGHT_REFS[2].guidance}
								ref_={WEIGHT_REFS[2].ref}
							/>
						</Stack>

						{loading ? (
							<Center style={{ marginTop: 12 }}><Spinner size={16} /></Center>
						) : severity ? (
							<Text size="sm" mt="md" style={{ color: "var(--text-dim)" }}>
								Live data: {severity.pct_destroyed}% destroyed · {severity.pct_partial}% partial · {severity.pct_minimal}% minimal across <strong>{severity.total_reports}</strong> reports
							</Text>
						) : (
							<Text size="sm" c="dimmed" mt="md">Severity summary unavailable</Text>
						)}
					</Card>

					{/* ── Thresholds ────────────────────────────────────────────────── */}
					<Card surface="surface" padding="spacious">
						<Text fw={700} size="lg" mb={4} style={{ color: "var(--text)" }}>Score thresholds</Text>
						<Text size="sm" c="dimmed" mb="md">
							Define where Low ends and Critical begins. These thresholds are applied after
							both global weights and on-the-fly session factors are combined.
						</Text>
						<Stack gap="md">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Text size="sm" fw={600} mb={4} style={{ color: "var(--text)" }}>Low / Medium boundary</Text>
									<input
										type="range" min={10} max={89} step={1}
										value={lowThreshold}
										onChange={(e) => setLowThreshold(Number(e.target.value))}
										className="w-full"
									/>
									<Text size="xs" c="dimmed" className="tnum">{lowThreshold}%</Text>
								</div>
								<div>
									<Text size="sm" fw={600} mb={4} style={{ color: "var(--text)" }}>Medium / Critical boundary</Text>
									<input
										type="range" min={11} max={99} step={1}
										value={critThreshold}
										onChange={(e) =>
											setCritThreshold(Math.max(Number(e.target.value), lowThreshold + 1))
										}
										className="w-full"
									/>
									<Text size="xs" c="dimmed" className="tnum">{critThreshold}%</Text>
								</div>
							</div>
							<div style={{ display: "flex", height: 12, overflow: "hidden" }}>
								{thresholdSegments.map((s, i) => (
									<div key={i} style={{ width: `${Math.max(0, s.w)}%`, background: s.c }} />
								))}
							</div>
							<div style={{ display: "flex", justifyContent: "space-between" }}>
								<Badge style={{ background: "var(--success-faint)", color: "var(--success)", border: 0 }}>
									Low: 0 – {lowThreshold}%
								</Badge>
								<Badge style={{ background: "var(--warning-faint)", color: "var(--warning)", border: 0 }}>
									Medium: {lowThreshold} – {critThreshold}%
								</Badge>
								<Badge style={{ background: "var(--danger-faint)", color: "var(--danger)", border: 0 }}>
									Critical: {critThreshold} – 100%
								</Badge>
							</div>

							<Divider style={{ margin: "4px 0" }} />

							{/* Faraja advice */}
							<div>
								<Group justify="space-between" align="center" mb={advice || advising ? "sm" : 0}>
									<Group gap="sm">
										<FarajaMark size={28} />
										<div className="leading-tight">
											<Text fw={700} size="sm" style={{ color: "var(--text)" }}>Ask Faraja for advice</Text>
											<Text size="xs" c="dimmed">Recommends thresholds from the live crisis severity</Text>
										</div>
									</Group>
									<Button size="sm" variant="outline" loading={advising} onClick={requestAdvice}>
										{advice ? "Re-evaluate" : "Get advice"}
									</Button>
								</Group>

								{advice && (
									<Card
										surface="surface" padding="standard"
										className="anim-rise"
										style={{ background: "var(--bg-card)" }}
									>
										<Stack gap={6}>
											{advice.lines.map((line, i) => (
												<Text key={i} size="sm" style={{ lineHeight: 1.5 }}>{line}</Text>
											))}
										</Stack>
										<Group gap="xs" mt="md" align="center">
											<Badge style={{ background: "var(--success-faint)", color: "var(--success)", border: 0 }}>
												Low/Med → {advice.low}
											</Badge>
											<Badge style={{ background: "var(--danger-faint)", color: "var(--danger)", border: 0 }}>
												Med/Crit → {advice.crit}
											</Badge>
											<Button
												size="sm"
												className="ml-auto"
												icon={<IconArrowUp size={14} />}
												onClick={applyAdvice}
												disabled={advice.low === lowThreshold && advice.crit === critThreshold}
											>
												Apply to thresholds
											</Button>
										</Group>
									</Card>
								)}
							</div>
						</Stack>
					</Card>
				</div>
			</div>
		</div>
	);
}

// ── WeightSlider atom ──────────────────────────────────────────────────────────

function WeightSlider({
	label,
	value,
	onChange,
	color,
	desc,
	guidance,
	ref_,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
	color: string;
	desc: string;
	guidance: string;
	ref_: string;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} className="mb-1">
				<Text size="sm" fw={700} style={{ color: "var(--text)" }}>{label}</Text>
				<Group gap={6}>
					<Text size="sm" c="dimmed" className="tnum" style={{ minWidth: 36, textAlign: "right" }}>
						{value}%
					</Text>
					<button
						onClick={() => setExpanded((p) => !p)}
						aria-label="Show scientific guidance"
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							color: expanded ? "var(--accent)" : "var(--text-muted)",
							padding: 0,
							display: "flex",
						}}
					>
						<IconBook size={15} />
					</button>
				</Group>
			</div>

			<input
				type="range"
				min={0}
				max={100}
				step={1}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="w-full"
				style={{ accentColor: color }}
			/>

			{/* Progress bar mirror */}
			<div style={{ height: 5, background: "var(--bg-card)", overflow: "hidden", marginTop: 4 }}>
				<div style={{ height: "100%", width: `${value}%`, background: color }} />
			</div>

			<Text size="xs" c="dimmed" mt={4}>{desc}</Text>

			{/* Scientific guidance (toggled) */}
			{expanded && (
				<div
					className="anim-rise"
					style={{
						marginTop: 10,
						background: "var(--bg-card)",
						border: "1px solid var(--border)",
						padding: "10px 14px",
					}}
				>
					<Text size="xs" style={{ lineHeight: 1.65, color: "var(--text-dim)", marginBottom: 6 }}>
						{guidance}
					</Text>
					<Text size="xs" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
						<IconBook size={11} style={{ display: "inline", marginRight: 4 }} />
						{ref_}
					</Text>
				</div>
			)}
		</div>
	);
}
