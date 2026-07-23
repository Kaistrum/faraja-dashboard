import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useDismissableDropdown } from "./useDismissableDropdown";

type MenuPosition = "bottom-start" | "bottom-end";

interface MenuContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  position: MenuPosition;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("Menu.* components must be rendered inside <Menu>");
  return ctx;
}

const POSITION_CLASS: Record<MenuPosition, string> = {
  "bottom-start": "top-full left-0",
  "bottom-end": "top-full right-0",
};

interface MenuProps {
  position?: MenuPosition;
  width?: number;
  className?: string;
  children: ReactNode;
}

function MenuRoot({ position = "bottom-start", width, className, children }: MenuProps) {
  const { open, setOpen, rootRef, triggerRef } = useDismissableDropdown();

  return (
    <MenuContext.Provider value={{ open, setOpen, triggerRef, position }}>
      <div ref={rootRef} className={["relative inline-block", className].filter(Boolean).join(" ")} style={{ "--menu-width": width ? `${width}px` : undefined } as CSSProperties}>
        {children}
      </div>
    </MenuContext.Provider>
  );
}

function Target({ children }: { children: ReactNode }) {
  const { open, setOpen, triggerRef } = useMenuContext();
  if (!isValidElement(children)) return null;
  const el = children as ReactElement<{ onClick?: (e: ReactMouseEvent) => void }>;
  return cloneElement(el, {
    ref: triggerRef,
    onClick: (e: ReactMouseEvent) => {
      el.props.onClick?.(e);
      setOpen(!open);
    },
    "aria-haspopup": "menu",
    "aria-expanded": open,
  } as Record<string, unknown>);
}

function Dropdown({ children, className }: { children: ReactNode; className?: string }) {
  const { open, position } = useMenuContext();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = dropdownRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  if (!open) return null;

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div
      ref={dropdownRef}
      role="menu"
      onKeyDown={handleKeyDown}
      className={[
        "absolute z-50 mt-1.5 py-1 border border-border bg-drop-bg shadow-md",
        "w-[var(--menu-width,auto)] min-w-[180px]",
        POSITION_CLASS[position],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{children}</div>;
}

interface MenuItemProps {
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  onClick?: () => void;
  color?: "red";
  style?: CSSProperties;
  children: ReactNode;
}

function Item({ leftSection, rightSection, onClick, color, style, children }: MenuItemProps) {
  const { setOpen } = useMenuContext();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick?.();
        setOpen(false);
      }}
      className={[
        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors duration-150 hover:bg-bg-card focus-visible:bg-bg-card focus-visible:outline-none",
        color === "red" ? "text-danger" : "text-text",
      ].join(" ")}
      style={style}
    >
      {leftSection}
      <span className="flex-1">{children}</span>
      {rightSection}
    </button>
  );
}

export const Menu = Object.assign(MenuRoot, { Target, Dropdown, Label, Item });
