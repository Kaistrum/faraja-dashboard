import type { CSSProperties, ElementType, ReactNode } from "react";

const FONT_SIZE: Record<string, number> = { xs: 11, sm: 13, md: 14.5, lg: 16, xl: 20 };
const SPACING: Record<string, number> = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24 };

type SpaceToken = keyof typeof SPACING;
type SpaceValue = number | SpaceToken;

function space(value?: SpaceValue): number | undefined {
  if (value == null) return undefined;
  return typeof value === "number" ? value : SPACING[value];
}

interface TextProps {
  as?: ElementType;
  size?: keyof typeof FONT_SIZE | number;
  fw?: number;
  c?: "dimmed" | "muted" | (string & {});
  ta?: "left" | "center" | "right";
  tt?: "uppercase" | "lowercase" | "capitalize" | "none";
  truncate?: boolean;
  lineClamp?: number;
  mt?: SpaceValue;
  mb?: SpaceValue;
  ml?: SpaceValue;
  mr?: SpaceValue;
  mx?: SpaceValue;
  my?: SpaceValue;
  pt?: SpaceValue;
  pb?: SpaceValue;
  pl?: SpaceValue;
  pr?: SpaceValue;
  px?: SpaceValue;
  py?: SpaceValue;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

/**
 * Thin typography atom matching the app's existing Mantine <Text> usage
 * pattern (fw/size/c/ta/tt/truncate/lineClamp + spacing shorthands) so the
 * hundreds of existing call sites only need an import swap, not a rewrite.
 */
export function Text({
  as: As = "div",
  size = "sm",
  fw,
  c,
  ta,
  tt,
  truncate,
  lineClamp,
  mt,
  mb,
  ml,
  mr,
  mx,
  my,
  pt,
  pb,
  pl,
  pr,
  px,
  py,
  className,
  style,
  children,
  ...rest
}: TextProps) {
  const color = c === "dimmed" ? "var(--text-dim)" : c === "muted" ? "var(--text-muted)" : c;

  const computedStyle: CSSProperties = {
    fontSize: typeof size === "number" ? size : (FONT_SIZE[size] ?? FONT_SIZE.sm),
    fontWeight: fw,
    color: color ?? "var(--text)",
    textAlign: ta,
    textTransform: tt,
    marginTop: space(mt) ?? space(my),
    marginBottom: space(mb) ?? space(my),
    marginLeft: space(ml) ?? space(mx),
    marginRight: space(mr) ?? space(mx),
    paddingTop: space(pt) ?? space(py),
    paddingBottom: space(pb) ?? space(py),
    paddingLeft: space(pl) ?? space(px),
    paddingRight: space(pr) ?? space(px),
    ...(lineClamp
      ? { display: "-webkit-box", WebkitLineClamp: lineClamp, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }
      : {}),
    ...(truncate ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
    ...style,
  };

  return (
    <As className={className} style={computedStyle} {...rest}>
      {children}
    </As>
  );
}
