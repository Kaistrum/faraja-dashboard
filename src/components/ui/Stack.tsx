import type { CSSProperties, ReactNode } from "react";

const GAP_PX: Record<string, number> = { xs: 8, sm: 10, md: 14, lg: 20, xl: 28 };

type Gap = number | keyof typeof GAP_PX;
type Justify = "start" | "center" | "end" | "between" | "flex-start" | "flex-end" | "space-between";
type Align = "start" | "center" | "end" | "stretch" | "flex-start" | "flex-end";

const JUSTIFY_CSS: Record<string, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  "flex-start": "flex-start",
  center: "center",
  end: "flex-end",
  "flex-end": "flex-end",
  between: "space-between",
  "space-between": "space-between",
};

const ALIGN_CSS: Record<string, CSSProperties["alignItems"]> = {
  start: "flex-start",
  "flex-start": "flex-start",
  center: "center",
  end: "flex-end",
  "flex-end": "flex-end",
  stretch: "stretch",
};

interface StackProps {
  direction?: "row" | "column";
  gap?: Gap;
  align?: Align;
  justify?: Justify;
  wrap?: boolean | "wrap" | "nowrap";
  grow?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

/**
 * Local flex primitive matching Mantine's Stack/Group prop shape (numeric or
 * token gap, "space-between"-style justify, boolean wrap) — real usage across
 * the app relies on values Stratum UI's own Stack component doesn't accept,
 * so this is a small standalone layout utility rather than a Stratum wrapper.
 */
export function Stack({
  direction = "column",
  gap = "md",
  align,
  justify,
  wrap,
  grow,
  className,
  style,
  children,
  ...rest
}: StackProps) {
  const gapPx = typeof gap === "number" ? gap : (GAP_PX[gap] ?? GAP_PX.md);
  const resolvedAlign = align ? ALIGN_CSS[align] : direction === "row" ? "center" : undefined;

  return (
    <div
      className={[
        "flex",
        direction === "row" ? "flex-row" : "flex-col",
        wrap === true || wrap === "wrap" ? "flex-wrap" : "",
        grow ? "[&>*]:flex-1" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        gap: gapPx,
        alignItems: resolvedAlign,
        justifyContent: justify ? JUSTIFY_CSS[justify] : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Group(props: StackProps) {
  return <Stack direction="row" {...props} />;
}
