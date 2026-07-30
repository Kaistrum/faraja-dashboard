import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Alert, Badge, Button, Card, Navbar, Spinner } from "@kaistrum/stratum-ui";
import { Center } from "@/components/ui/Center";
import { Group, Stack } from "@/components/ui/Stack";
import { Text } from "@/components/ui/Text";
import { IconAlertTriangle, IconLogout, IconRefresh } from "@tabler/icons-react";
import Image from "next/image";
import { DisasterGlyph } from "@/components/icons";
import type { PointFeature } from "@/types";
import { DAMAGE_COLORS, DISASTER_COLORS } from "@/types";

const POLL_INTERVAL_MS = 8_000;

interface FieldResponder {
	id: string;
	name: string;
	team: string;
}

const RAW_STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
	pending: { label: "New — needs acceptance", bg: "var(--warning-faint)", color: "var(--warning)" },
	in_progress: { label: "In progress", bg: "var(--accent-faint)", color: "var(--accent-strong)" },
	completed: { label: "Resolved", bg: "var(--success-faint)", color: "var(--success)" },
	cancelled: { label: "Cancelled", bg: "var(--bg-card)", color: "var(--text-muted)" },
};

function formatDate(iso: string) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function FieldPage() {
	const router = useRouter();
	const [responder, setResponder] = useState<FieldResponder | null>(null);
	const [checking, setChecking] = useState(true);
	const [points, setPoints] = useState<PointFeature[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [actioningId, setActioningId] = useState<string | null>(null);
	const [actionError, setActionError] = useState("");

	// ── Auth ────────────────────────────────────────────────────────────────
	useEffect(() => {
		const raw = localStorage.getItem("auth_responder");
		if (!raw) {
			router.replace("/field-signin");
		} else {
			try {
				setResponder(JSON.parse(raw) as FieldResponder);
			} catch {
				router.replace("/field-signin");
			}
		}
		setChecking(false);
	}, [router]);

	const loadTasks = useCallback(async () => {
		try {
			const res = await fetch("/api/clusters");
			if (!res.ok) {
				setError("Could not load your assignments.");
				return;
			}
			const data = (await res.json()) as { points?: PointFeature[] };
			setError("");
			setPoints(data.points ?? []);
		} catch {
			setError("Could not load your assignments.");
		} finally {
			setLoading(false);
		}
	}, []);

	// Poll so a new assignment (or a change made from another tab/device) shows
	// up without a manual refresh — there is no push/realtime channel here.
	useEffect(() => {
		if (!responder) return;
		loadTasks();
		const interval = setInterval(loadTasks, POLL_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [responder, loadTasks]);

	const myPoints = useMemo(
		() => points.filter((pt) => pt.properties.assigned_responder_id === responder?.id),
		[points, responder],
	);

	const active = useMemo(
		() => myPoints.filter((pt) => pt.properties.assignment_status_raw === "pending" || pt.properties.assignment_status_raw === "in_progress"),
		[myPoints],
	);
	const closed = useMemo(
		() => myPoints.filter((pt) => pt.properties.assignment_status_raw === "completed" || pt.properties.assignment_status_raw === "cancelled"),
		[myPoints],
	);

	async function updateStatus(point: PointFeature, status: "in_progress" | "completed") {
		const assignmentId = point.properties.assignment_id;
		if (!assignmentId) return;
		setActioningId(assignmentId);
		setActionError("");
		try {
			const res = await fetch(`/api/assignments/${assignmentId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status }),
			});
			const data = (await res.json()) as { success: boolean; error?: string };
			if (!res.ok || !data.success) {
				setActionError(data.error || "Update failed — please try again.");
				return;
			}
			await loadTasks();
		} catch {
			setActionError("Update failed — please try again.");
		} finally {
			setActioningId(null);
		}
	}

	function handleSwitch() {
		localStorage.removeItem("auth_responder");
		router.push("/field-signin");
	}

	if (checking || !responder) {
		return (
			<Center style={{ height: "100vh" }}>
				<Spinner />
			</Center>
		);
	}

	const nav = (
		<div className="flex items-center gap-2.5">
			<Image src="/faraja-logo.png" alt="Faraja" width={100} height={56} style={{ objectFit: "contain" }} />
			<Text fw={700} style={{ fontSize: 13 }}>Field responder</Text>
		</div>
	);

	return (
		<div className="theme-light-forced min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
			<Navbar
				className="navbar-tall"
				logo={nav}
				items={[]}
				actions={
					<Group gap="xs" align="center">
						<Text size="sm" fw={600}>{responder.name}</Text>
						<Button size="sm" variant="ghost" onClick={handleSwitch}>
							<IconLogout size={14} className="mr-1" /> Switch
						</Button>
					</Group>
				}
			/>

			<main className="flex-1 overflow-auto p-4">
				<div className="mx-auto w-full max-w-2xl">
					<Group justify="space-between" align="center" mb="md">
						<div>
							<Text fw={700} size="xl">Your assignments</Text>
							<Text size="sm" c="dimmed">{responder.team}</Text>
						</div>
						<Button size="sm" variant="outline" onClick={loadTasks} loading={loading}>
							<IconRefresh size={14} className="mr-1" /> Refresh
						</Button>
					</Group>

					{error && (
						<Alert variant="danger" className="mb-4">{error}</Alert>
					)}
					{actionError && (
						<Alert variant="danger" className="mb-4">{actionError}</Alert>
					)}

					{loading && myPoints.length === 0 ? (
						<Center style={{ padding: "48px 0" }}><Spinner /></Center>
					) : (
						<Stack gap="lg">
							<div>
								<Text fw={600} size="sm" mb="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.04em" }}>
									Active ({active.length})
								</Text>
								{active.length === 0 ? (
									<Card surface="surface" padding="standard">
										<Text size="sm" c="dimmed" ta="center">No active assignments right now</Text>
									</Card>
								) : (
									<Stack gap="sm">
										{active.map((point) => {
											const props = point.properties;
											const rawStatus = props.assignment_status_raw ?? "pending";
											const statusStyle = RAW_STATUS_STYLE[rawStatus];
											const isActioning = actioningId === props.assignment_id;
											return (
												<Card key={props.point_id} surface="surface" padding="standard">
													<Group justify="space-between" align="flex-start" mb="xs">
														<div>
															<Text fw={600}>{props.infrastructure_name}</Text>
															<Text size="xs" c="dimmed">{formatDate(props.submitted_at)}</Text>
														</div>
														<Badge style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, border: 0 }}>
															{statusStyle.label}
														</Badge>
													</Group>
													<Group gap="xs" mb="sm" wrap="wrap">
														<Badge
															icon={<DisasterGlyph type={props.disaster_type} size={12} />}
															style={{ backgroundColor: DISASTER_COLORS[props.disaster_type], color: "#fff", border: 0 }}
														>
															{props.disaster_type}
														</Badge>
														<Badge style={{ backgroundColor: DAMAGE_COLORS[props.damage_level], color: "#fff", border: 0 }}>
															{props.damage_level} damage
														</Badge>
														{props.assignment_priority && (
															<Badge style={{ backgroundColor: DAMAGE_COLORS[props.assignment_priority], color: "#fff", border: 0 }}>
																{props.assignment_priority} priority
															</Badge>
														)}
													</Group>
													{props.casualties > 0 && (
														<Group gap={6} mb="sm" style={{ color: "var(--danger)" }}>
															<IconAlertTriangle size={14} />
															<Text size="sm" fw={600}>
																{props.casualties} {props.casualties === 1 ? "casualty" : "casualties"}
															</Text>
														</Group>
													)}
													<Text size="sm" mb="sm">{props.report_summary}</Text>
													{props.assignment_notes && (
														<div style={{ background: "var(--bg-card)", padding: "8px 10px", marginBottom: 12 }}>
															<Text size="xs" c="dimmed" mb={2}>Instructions</Text>
															<Text size="sm">{props.assignment_notes}</Text>
														</div>
													)}
													{rawStatus === "pending" ? (
														<Button fullWidth loading={isActioning} onClick={() => updateStatus(point, "in_progress")}>
															Accept task
														</Button>
													) : (
														<Button fullWidth loading={isActioning} onClick={() => updateStatus(point, "completed")}>
															Mark resolved
														</Button>
													)}
												</Card>
											);
										})}
									</Stack>
								)}
							</div>

							{closed.length > 0 && (
								<div>
									<Text fw={600} size="sm" mb="sm" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.04em" }}>
										Resolved ({closed.length})
									</Text>
									<Stack gap="sm">
										{closed.map((point) => {
											const props = point.properties;
											const statusStyle = RAW_STATUS_STYLE[props.assignment_status_raw ?? "completed"];
											return (
												<Card key={props.point_id} surface="surface" padding="standard" style={{ opacity: 0.7 }}>
													<Group justify="space-between" align="center">
														<Text fw={500} size="sm">{props.infrastructure_name}</Text>
														<Badge style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, border: 0 }}>
															{statusStyle.label}
														</Badge>
													</Group>
												</Card>
											);
										})}
									</Stack>
								</div>
							)}
						</Stack>
					)}
				</div>
			</main>
		</div>
	);
}
