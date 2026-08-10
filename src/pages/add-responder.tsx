import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Alert, Badge, Button, Card, Input, Select, Spinner } from "@kaistrum/stratum-ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Center } from "@/components/ui/Center";
import { Group, Stack } from "@/components/ui/Stack";
import { Text } from "@/components/ui/Text";
import { IconAlertCircle, IconUserPlus } from "@tabler/icons-react";
import Header from "@/components/Header";
import type { Responder } from "@/types";

const ROLE_OPTIONS = [
	{ value: "field", label: "Field Enumerator" },
	{ value: "supervisor", label: "Supervisor" },
	{ value: "analyst", label: "Analyst" },
	{ value: "admin", label: "Admin" },
];

interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: string;
}

export default function AddResponderPage() {
	const router = useRouter();
	const [user, setUser] = useState<AuthUser | null>(null);
	const [checking, setChecking] = useState(true);

	const [responders, setResponders] = useState<Responder[]>([]);
	const [loadingRoster, setLoadingRoster] = useState(true);

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState("field");
	const [organization, setOrganization] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	// ── Auth (admin-only) ───────────────────────────────────────────────────────
	useEffect(() => {
		const raw = localStorage.getItem("auth_user");
		if (!raw) {
			router.replace("/signin");
			return;
		}
		try {
			const parsed = JSON.parse(raw) as AuthUser;
			if (parsed.role !== "admin") {
				router.replace("/dashboard");
				return;
			}
			setUser(parsed);
		} catch {
			router.replace("/signin");
			return;
		}
		setChecking(false);
	}, [router]);

	// ── Roster (for context / avoiding duplicates) ──────────────────────────────
	const loadResponders = async () => {
		setLoadingRoster(true);
		try {
			const res = await fetch("/api/responders");
			if (res.ok) setResponders((await res.json()) as Responder[]);
		} catch {
			// ignore
		} finally {
			setLoadingRoster(false);
		}
	};

	useEffect(() => {
		if (user) loadResponders();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSuccess(null);
		setSaving(true);
		try {
			const res = await fetch("/api/responders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: name.trim(),
					email: email.trim(),
					password: password,
					role,
					organization: organization.trim(),
				}),
			});
			const data = await res.json().catch(() => ({ success: false }));
			if (res.ok && data.success) {
				setSuccess(`${name.trim()} was registered as a responder.`);
				setName("");
				setEmail("");
				setPassword("");
				setRole("field");
				setOrganization("");
				loadResponders();
			} else {
				setError(typeof data.error === "string" ? data.error : "Could not register this responder — please try again.");
			}
		} catch {
			setError("Could not register this responder — the server could not be reached.");
		} finally {
			setSaving(false);
		}
	}

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
			<div className="flex-1 overflow-auto p-4">
				<div className="max-w-3xl mx-auto grid gap-4" style={{ gridTemplateColumns: "1fr 1.2fr" }}>

					{/* Registration form */}
					<Card surface="surface" padding="spacious">
						<Group align="center" gap="xs" mb="md">
							<IconUserPlus size={18} />
							<Text fw={700} size="lg">Register a responder</Text>
						</Group>
						<Text size="sm" c="dimmed" mb="md">
							Adds a new responder to the roster. They'll show up on the field sign-in
							screen right away, and become active — assignable from the Responders
							page — once they sign in there for the first time.
						</Text>

						<form onSubmit={handleSubmit}>
							<Stack gap="md">
								{error && (
									<Alert icon={<IconAlertCircle size={16} />} variant="danger">
										{error}
									</Alert>
								)}
								{success && (
									<Alert title="Registered" variant="success">
										{success}
									</Alert>
								)}
								<Input
									label="Full name"
									placeholder="e.g. Amina Yusuf"
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
								/>
								<Input
									label="Email"
									type="email"
									placeholder="responder@example.org"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
								/>
								<PasswordInput
									label="Password"
									placeholder="Temporary password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
								/>
								<Select
									label="Role"
									options={ROLE_OPTIONS}
									value={role}
									onChange={(e) => setRole(e.target.value)}
								/>
								<Input
									label="Organization / team"
									placeholder="e.g. Red Cross Kenya"
									value={organization}
									onChange={(e) => setOrganization(e.target.value)}
								/>
								<Button type="submit" loading={saving} fullWidth className="mt-2">
									Register responder
								</Button>
							</Stack>
						</form>
					</Card>

					{/* Current roster, for context */}
					<Card surface="surface" padding="spacious">
						<Group justify="space-between" mb="md">
							<Text fw={700} size="lg">Current roster</Text>
							<Badge>{responders.length}</Badge>
						</Group>
						{loadingRoster ? (
							<Center style={{ padding: "24px 0" }}><Spinner size={16} /></Center>
						) : responders.length === 0 ? (
							<Text size="sm" c="dimmed">No responders registered yet.</Text>
						) : (
							<div style={{ maxHeight: 420, overflowY: "auto" }}>
								<Stack gap={4}>
									{responders.map((r) => (
										<Card key={r.id} surface="card" padding="none" style={{ padding: "8px 10px" }}>
											<Group align="center" justify="space-between">
												<div style={{ minWidth: 0 }}>
													<Text fw={500} size="sm" truncate>{r.name}</Text>
													<Text size="xs" c="dimmed" truncate>{r.team}</Text>
												</div>
												<Badge
													style={
														r.status === "offline"
															? { background: "var(--bg-card)", color: "var(--text-muted)", border: 0 }
															: { background: "var(--success-faint)", color: "var(--success)", border: 0 }
													}
												>
													{r.status === "offline" ? "Inactive" : "Active"}
												</Badge>
											</Group>
										</Card>
									))}
								</Stack>
							</div>
						)}
					</Card>
				</div>
			</div>
		</div>
	);
}
