import { useEffect } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { Button, Card, Footer, Grid, Hero, Navbar, Section, StatStrip, ThemeToggle } from "@kaistrum/stratum-ui";
import { Text } from "@/components/ui/Text";
import { FarajaMark } from "@/components/icons";
import {
	IconMap2,
	IconActivity,
	IconUsers,
	IconAdjustmentsHorizontal,
	IconRoute,
	IconArrowRight,
} from "@tabler/icons-react";

const FEATURES = [
	{
		icon: IconMap2,
		title: "Live crisis map",
		desc: "Incoming reports cluster by zone in real time, colour-coded by severity so the worst-hit areas surface immediately.",
	},
	{
		icon: IconActivity,
		title: "AI-assisted triage",
		desc: "Damage reports are automatically classified into Critical, Medium, or Low severity tiers using AI-enhanced assessment.",
	},
	{
		icon: IconUsers,
		title: "Responder coordination",
		desc: "Match teams to incidents by real-time availability, capacity, and distance — eligibility is checked before every assignment.",
	},
	{
		icon: IconAdjustmentsHorizontal,
		title: "Configurable priority weighting",
		desc: "Tune how damage severity, time sensitivity, and population exposure combine into a single triage score.",
	},
	{
		icon: null,
		title: "Faraja, the AI co-pilot",
		desc: "Ask for a situation summary, the most critical zones, or who to deploy next — in plain language.",
	},
	{
		icon: IconRoute,
		title: "Route optimization",
		desc: "Generate an optimized, multi-stop delivery route for aid convoys directly from the incidents in view.",
	},
];

const STATS = [
	{ value: "11", label: "Crisis types recognized" },
	{ value: "9", label: "Infrastructure categories tracked" },
	{ value: "3", label: "Severity tiers for triage" },
	{ value: "24/7", label: "Live incident monitoring" },
];

export default function LandingPage() {
	const router = useRouter();

	// Returning users skip the marketing page entirely.
	useEffect(() => {
		if (localStorage.getItem("auth_user")) router.replace("/dashboard");
	}, [router]);

	const nav = (
		<div className="flex items-center gap-2.5">
			<Image src="/faraja-logo.png" alt="Faraja" width={121} height={68} style={{ objectFit: "contain" }} />
		</div>
	);

	return (
		<div>
			<Navbar
				className="navbar-tall theme-light-forced"
				logo={nav}
				items={[
					{ label: "Capabilities", href: "#features" },
					{ label: "By the numbers", href: "#stats" },
				]}
				actions={<ThemeToggle size="md" />}
				cta={{ label: "Sign in", href: "/signin" }}
			/>

			<div className="theme-dark-forced">
				<Hero
					eyebrow="PROTECT · REPORT · RESPOND"
					title="Faraja Response Console"
					subtitle="A live coordination layer for disaster response — from first report to responder dispatch, in one console."
					background={
						<div className="absolute inset-0">
							<Image
								src="/background-landing.jpg"
								alt=""
								fill
								priority
								sizes="100vw"
								style={{
									objectFit: "cover",
									objectPosition: "center 30%",
									filter: "grayscale(0.3) contrast(1.08) brightness(0.8)",
								}}
							/>
							<div
								className="absolute inset-0"
								style={{
									background:
										"linear-gradient(180deg, rgba(7,9,15,0.65) 0%, rgba(7,9,15,0.4) 30%, rgba(7,9,15,0.55) 60%, rgba(7,9,15,0.97) 100%)",
								}}
							/>
						</div>
					}
				/>
			</div>

			<Section spacing="standard" surface="bg" containerWidth="wide">
				<div id="features" className="scroll-mt-20">
					<Text size="xl" fw={700} ta="center" mb={2} style={{ fontSize: 30 }}>What the console does</Text>
					<Text size="sm" c="dimmed" ta="center" mb="xl">
						Built for the moments when reports come in faster than anyone can read them.
					</Text>
					<Grid columns={3} gap="lg">
						{FEATURES.map((f) => {
							const Icon = f.icon;
							return (
								<Card key={f.title} surface="surface" padding="standard">
									<div className="icon-chip" style={{ width: 36, height: 36, marginBottom: 14 }}>
										{Icon ? <Icon size={18} /> : <FarajaMark size={22} />}
									</div>
									<Text fw={700} size="md" mb={6} style={{ color: "var(--text)" }}>{f.title}</Text>
									<Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>{f.desc}</Text>
								</Card>
							);
						})}
					</Grid>
				</div>
			</Section>

			<Section spacing="compact" surface="surface" containerWidth="wide">
				<div id="stats" className="scroll-mt-20">
					<StatStrip stats={STATS} />
				</div>
			</Section>

			<Section spacing="hero" surface="bg" containerWidth="narrow">
				<div className="text-center">
					<Text size="xl" fw={700} ta="center" mb={4} style={{ fontSize: 26 }}>
						Ready to coordinate the response?
					</Text>
					<Text size="sm" c="dimmed" ta="center" mb="xl">
						Sign in to see live incidents, assign responders, and tune triage priorities for your team.
					</Text>
					<div className="flex justify-center">
						<Button size="lg" onClick={() => router.push("/signin")}>
							Sign in to the console
							<IconArrowRight size={16} className="ml-1.5" />
						</Button>
					</div>
				</div>
			</Section>

			<Footer
				className="theme-light-forced"
				logo={<Image src="/faraja-logo.png" alt="Faraja" width={85} height={48} style={{ objectFit: "contain" }} />}
				tagline="A crisis-response coordination console for frontline field teams."
				columns={[
					{
						heading: "Platform",
						links: [
							{ label: "Capabilities", href: "#features" },
							{ label: "By the numbers", href: "#stats" },
						],
					},
					{
						heading: "Access",
						links: [{ label: "Sign in", href: "/signin" }],
					},
				]}
			/>
		</div>
	);
}
