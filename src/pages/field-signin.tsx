import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Alert, Button, Card, Input, Navbar, Spinner } from "@kaistrum/stratum-ui";
import { Center } from "@/components/ui/Center";
import { Group, Stack } from "@/components/ui/Stack";
import { Text } from "@/components/ui/Text";
import { IconAlertCircle, IconSearch } from "@tabler/icons-react";
import Image from "next/image";
import type { Responder } from "@/types";

const AVATAR_CHIP =
	"h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0";
const AVATAR_CHIP_STYLE = { background: "var(--bg-card)", color: "var(--text-dim)" } as const;

export default function FieldSignIn() {
	const router = useRouter();
	const [responders, setResponders] = useState<Responder[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");

	useEffect(() => {
		let mounted = true;
		const load = async () => {
			try {
				const res = await fetch("/api/responders");
				if (res.ok && mounted) setResponders((await res.json()) as Responder[]);
				else if (mounted) setError("Could not load the responder roster.");
			} catch {
				if (mounted) setError("Could not load the responder roster.");
			} finally {
				if (mounted) setLoading(false);
			}
		};
		load();
		return () => { mounted = false; };
	}, []);

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return responders;
		return responders.filter(
			(r) => r.name.toLowerCase().includes(needle) || r.team.toLowerCase().includes(needle),
		);
	}, [responders, query]);

	function handleSelect(responder: Responder) {
		localStorage.setItem(
			"auth_responder",
			JSON.stringify({ id: responder.id, name: responder.name, team: responder.team }),
		);
		// Best-effort — a responder should still reach their tasks even if this fails.
		fetch(`/api/responders/${responder.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ is_active: true }),
		}).catch(() => {});
		router.push("/field");
	}

	const nav = (
		<div className="flex items-center gap-2.5">
			<Image src="/faraja-logo.png" alt="Faraja" width={121} height={68} style={{ objectFit: "contain" }} />
		</div>
	);

	return (
		<div className="theme-light-forced min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
			<Navbar className="navbar-tall" logo={nav} items={[]} cta={{ label: "Coordinator sign in", href: "/signin" }} />

			<div className="flex-1 flex items-center justify-center p-4">
				<Card surface="card" padding="spacious" className="w-full max-w-sm shadow-md">
					<Stack align="center" mb="lg">
						<Text fw={700} size="lg">Field responder sign-in</Text>
						<Text size="sm" c="dimmed" ta="center">
							Find yourself on the roster to see the tasks assigned to you
						</Text>
					</Stack>

					{error && (
						<Alert icon={<IconAlertCircle size={16} />} variant="danger" className="mb-3">
							{error}
						</Alert>
					)}

					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search by name or team..."
						leadingIcon={<IconSearch size={14} />}
						className="mb-3"
					/>

					{loading ? (
						<Center style={{ padding: "24px 0" }}><Spinner /></Center>
					) : (
						<div style={{ maxHeight: 340, overflowY: "auto" }}>
							<Stack gap={4}>
								{visible.map((responder) => {
									const initials = responder.name.split(" ").map((p) => p[0]).join("");
									return (
										<Card
											key={responder.id}
											surface="surface"
											padding="none"
											style={{ cursor: "pointer", padding: "8px 10px" }}
											onClick={() => handleSelect(responder)}
										>
											<Group align="center" gap="xs">
												<div className={AVATAR_CHIP} style={AVATAR_CHIP_STYLE}>{initials}</div>
												<div style={{ flex: 1, minWidth: 0 }}>
													<Text fw={500} size="sm" truncate>{responder.name}</Text>
													<Text size="xs" c="dimmed" truncate>{responder.team}</Text>
												</div>
												<Button size="sm" variant="outline">This is me</Button>
											</Group>
										</Card>
									);
								})}
								{!loading && visible.length === 0 && (
									<Text size="sm" c="dimmed" ta="center" mt="md">No responders match your search</Text>
								)}
							</Stack>
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
