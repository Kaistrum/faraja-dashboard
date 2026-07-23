import {
	IconActivity,
	IconBiohazard,
	IconFlame,
	IconRipple,
	IconTornado,
	IconMountain,
	IconAlertTriangle,
	IconWind,
	IconDroplets,
	IconSwords,
	IconUsersGroup,
	type IconProps,
} from "@tabler/icons-react";
import type { DisasterType } from "@/types";

/** Each crisis is identified by a real glyph, never by colour alone. */
export const DISASTER_ICON: Record<DisasterType, React.ComponentType<IconProps>> = {
	Chemical: IconBiohazard,
	Earthquake: IconActivity,
	Fire: IconFlame,
	Flood: IconRipple,
	Hurricane: IconTornado,
	Cyclone: IconWind,
	Landslide: IconMountain,
	Tsunami: IconDroplets,
	"Civil Unrest": IconUsersGroup,
	Conflict: IconSwords,
	Other: IconAlertTriangle,
};

export function DisasterGlyph({
	type,
	size = 16,
	color,
	stroke = 2,
}: {
	type: DisasterType;
	size?: number;
	color?: string;
	stroke?: number;
}) {
	const Comp = DISASTER_ICON[type] ?? IconAlertTriangle;
	return <Comp size={size} color={color} stroke={stroke} />;
}

/**
 * Faraja's mark — a calm monochrome "spark": the native AI signal,
 * stripped of gradients and noise. Inverts cleanly in both themes.
 */
export function FarajaMark({ size = 28, radius }: { size?: number; radius?: number }) {
	const glyph = Math.round(size * 0.62);
	return (
		<span
			aria-hidden
			style={{
				width: size,
				height: size,
				borderRadius: radius ?? Math.round(size * 0.34),
				background: "var(--text)",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
			}}
		>
			<svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none">
				<path
					d="M12 1.6C12.85 8.1 15.9 11.15 22.4 12C15.9 12.85 12.85 15.9 12 22.4C11.15 15.9 8.1 12.85 1.6 12C8.1 11.15 11.15 8.1 12 1.6Z"
					fill="var(--bg-surface)"
				/>
				<path
					d="M19.2 2.4C19.45 4.3 20.1 4.95 22 5.2C20.1 5.45 19.45 6.1 19.2 8C18.95 6.1 18.3 5.45 16.4 5.2C18.3 4.95 18.95 4.3 19.2 2.4Z"
					fill="var(--bg-surface)"
					opacity={0.65}
				/>
			</svg>
		</span>
	);
}
