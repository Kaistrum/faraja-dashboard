import type { CSSProperties, ReactNode } from "react";

interface CenterProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [key: string]: unknown;
}

export function Center({ className, style, children, ...rest }: CenterProps) {
  return (
    <div className={["flex items-center justify-center", className ?? ""].filter(Boolean).join(" ")} style={style} {...rest}>
      {children}
    </div>
  );
}
