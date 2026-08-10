import { useState } from "react";
import { useRouter } from "next/router";
import { Input, Button, Card, Alert, Navbar } from "@kaistrum/stratum-ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Stack } from "@/components/ui/Stack";
import { Text } from "@/components/ui/Text";
import { IconAlertCircle } from "@tabler/icons-react";
import Image from "next/image";

const MOCK_USERS = [
	{ id: "u1", email: "johndoe@gmail.com", password: "password123", name: "Jane Doe", role: "coordinator" },
	{ id: "u2", email: "admin@faraja.org", password: "admin123", name: "Admin User", role: "admin" }
];

export default function SignIn() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setLoading(true);

		const user = MOCK_USERS.find(
			(u) => u.email === email && u.password === password
		);

		if (user) {
			localStorage.setItem(
				"auth_user",
				JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role })
			);
			router.push("/dashboard");
		} else {
			setError("Invalid email or password.");
			setLoading(false);
		}
	}

	const nav = (
		<div className="flex items-center gap-2.5">
			<Image src="/faraja-logo.png" alt="Faraja" width={121} height={68} style={{ objectFit: "contain" }} />
		</div>
	);

	return (
		<div className="theme-light-forced min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
			<Navbar className="navbar-tall" logo={nav} items={[]} cta={{ label: "Back to home", href: "/" }} />

			<div className="flex-1 flex items-center justify-center">
				<Card surface="card" padding="spacious" className="w-full max-w-sm shadow-md">
					<Stack align="center" mb="xl">
						<div className="flex items-center gap-3">
							<Image
								src="/faraja-logo.png"
								alt="Faraja"
								width={142}
								height={80}
								style={{ objectFit: "contain" }}
								onError={(e) => {
									(e.target as HTMLImageElement).style.display = "none";
								}}
							/>
						</div>
					</Stack>

					<form onSubmit={handleSubmit}>
						<Stack>
							{error && (
								<Alert icon={<IconAlertCircle size={16} />} variant="danger">
									{error}
								</Alert>
							)}
							<Input
								label="Email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
							/>
							<PasswordInput
								label="Password"
								placeholder="Your password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
							<Button type="submit" loading={loading} fullWidth className="mt-2">
								Sign In
							</Button>
						</Stack>
					</form>

					<Text size="xs" c="dimmed" ta="center" mt="md">
						Demo: johndoe@gmail.com / password123
					</Text>
				</Card>
			</div>
		</div>
	);
}
