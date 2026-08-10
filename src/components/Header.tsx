import { useRouter } from "next/router";
import { Avatar, Navbar, ThemeToggle } from "@kaistrum/stratum-ui";
import { Menu } from "@/components/ui/Menu";
import { Text } from "@/components/ui/Text";
import Image from "next/image";
import { IconLogout, IconChevronDown, IconArrowRight } from "@tabler/icons-react";
import { FarajaMark } from "@/components/icons";

interface User {
	name: string;
	email: string;
	role?: string;
}

interface HeaderProps {
	user: User;
	/** When provided, shows the Faraja co-pilot trigger. */
	onOpenAssistant?: () => void;
}

const NAV_LINKS = [
	{ label: "Operations", href: "/dashboard" },
	{ label: "Incidents", href: "/incidents" },
	{ label: "Responders", href: "/responders" },
	{ label: "Weighting", href: "/scoring" },
	{ label: "Add Responder", href: "/add-responder", adminOnly: true },
];

export default function Header({ user, onOpenAssistant }: HeaderProps) {
	const router = useRouter();

	function handleSignOut() {
		localStorage.removeItem("auth_user");
		router.push("/signin");
	}

	// Stratum's Navbar renders `items` as plain <a href> (hard navigation) with
	// no active-route styling — both are wrong for this app, so nav links are
	// rendered ourselves (client-side routed, active-highlighted) inside the
	// `logo` slot instead of via Navbar's own `items` prop.
	const brand = (
		<div className="flex items-center gap-6">
			<div className="flex items-center gap-2.5">
				<Image src="/faraja-logo.png" alt="Faraja" width={121} height={68} style={{ objectFit: "contain" }} priority />
				<Text fw={700} style={{ fontSize: 13, letterSpacing: "-0.01em" }}>Response Console</Text>
			</div>
			<nav className="hidden md:flex items-center h-full" aria-label="Main navigation">
				{NAV_LINKS.filter((link) => !link.adminOnly || user.role === "admin").map((link) => {
					const active = router.pathname === link.href;
					return (
						<button
							key={link.href}
							type="button"
							onClick={() => router.push(link.href)}
							className={[
								"flex items-center gap-1 px-4 h-full text-sm font-medium border-b-2 transition-colors duration-150",
								active ? "text-accent border-accent" : "text-text-dim border-transparent hover:text-text",
							].join(" ")}
						>
							{link.label}
						</button>
					);
				})}
			</nav>
		</div>
	);

	const actions = (
		<div className="flex items-center gap-2">
			<ThemeToggle size="md" />

			{onOpenAssistant && (
				// Matches Navbar's own `cta` slot styling exactly — not passed via the
				// `cta` prop itself because that only supports a static href, not an
				// onClick, and this opens the assistant panel rather than navigating.
				<button
					type="button"
					onClick={onOpenAssistant}
					className="group inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 font-medium text-xs bg-accent text-text-on-accent transition-all duration-200 hover:gap-2.5"
				>
					<FarajaMark size={20} />
					Ask Faraja
					<span className="w-6 h-6 flex items-center justify-center bg-bg text-accent transition-transform duration-200 group-hover:scale-110 shrink-0">
						<IconArrowRight size={11} />
					</span>
				</button>
			)}

			<Menu position="bottom-end" width={240}>
				<Menu.Target>
					<button
						type="button"
						className="flex items-center gap-2.5 transition-colors duration-150 hover:bg-bg-card"
						style={{ padding: "4px 10px 4px 4px" }}
					>
						<Avatar shape="square" size="sm" name={user.name} />
						<div className="hidden sm:block text-left leading-tight max-w-[140px]">
							<Text fw={600} truncate style={{ fontSize: 12.5 }}>{user.name}</Text>
							<Text truncate mt={1} style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{user.email}</Text>
						</div>
						<IconChevronDown size={14} color="var(--text-muted)" />
					</button>
				</Menu.Target>
				<Menu.Dropdown>
					<div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border">
						<Avatar shape="square" size="sm" name={user.name} />
						<div className="min-w-0">
							<Text fw={600} truncate style={{ fontSize: 13 }}>{user.name}</Text>
							<Text truncate mt={1} style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.email}</Text>
						</div>
					</div>
					<Menu.Item leftSection={<IconLogout size={15} />} color="red" onClick={handleSignOut}>
						Sign out
					</Menu.Item>
				</Menu.Dropdown>
			</Menu>
		</div>
	);

	return (
		<Navbar
			className="static shrink-0 navbar-tall theme-light-forced"
			logo={brand}
			items={[]}
			actions={actions}
		/>
	);
}
