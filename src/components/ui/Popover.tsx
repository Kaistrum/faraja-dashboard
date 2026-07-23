import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useDismissableDropdown } from "./useDismissableDropdown";

type PopoverPosition = "right-start" | "top-start" | "bottom-start" | "bottom-end";

interface PopoverContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  position: PopoverPosition;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error("Popover.* components must be rendered inside <Popover>");
  return ctx;
}

const POSITION_CLASS: Record<PopoverPosition, string> = {
  "right-start": "left-full top-0 ml-1.5",
  "top-start": "bottom-full left-0 mb-1.5",
  "bottom-start": "top-full left-0 mt-1.5",
  "bottom-end": "top-full right-0 mt-1.5",
};

interface PopoverProps {
  position?: PopoverPosition;
  children: ReactNode;
}

/** Same interaction core as Menu, but a bare content slot instead of an item
 * list — used for arbitrary popover content (basemap swatches, a legend)
 * where <Menu>'s command-list semantics don't apply. */
function PopoverRoot({ position = "bottom-start", children }: PopoverProps) {
  const { open, setOpen, rootRef, triggerRef } = useDismissableDropdown();

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef, position }}>
      <div ref={rootRef} className="relative inline-block">
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

function Target({ children }: { children: ReactNode }) {
  const { open, setOpen, triggerRef } = usePopoverContext();
  if (!isValidElement(children)) return null;
  const el = children as ReactElement<{ onClick?: (e: ReactMouseEvent) => void }>;
  return cloneElement(el, {
    ref: triggerRef,
    onClick: (e: ReactMouseEvent) => {
      el.props.onClick?.(e);
      setOpen(!open);
    },
    "aria-expanded": open,
  } as Record<string, unknown>);
}

const PAD_PX: Record<string, number> = { xs: 6, sm: 10, md: 14, lg: 20 };

interface PopoverDropdownProps {
  p?: number | keyof typeof PAD_PX;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

function Dropdown({ p, className, style, children }: PopoverDropdownProps) {
  const { open, position } = usePopoverContext();
  if (!open) return null;
  const padding = typeof p === "number" ? p : p ? PAD_PX[p] : 10;
  return (
    <div
      className={["absolute z-50 border border-border bg-bg-surface shadow-md", POSITION_CLASS[position], className]
        .filter(Boolean)
        .join(" ")}
      style={{ padding, ...style }}
    >
      {children}
    </div>
  );
}

export const Popover = Object.assign(PopoverRoot, { Target, Dropdown });
