import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

function TableRoot({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cx("w-full border-collapse text-sm", className)} {...rest}>
      {children}
    </table>
  );
}

function Thead({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...rest}>{children}</thead>;
}

function Tbody({ children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...rest}>{children}</tbody>;
}

function Tr({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cx("border-b border-border last:border-0 hover:bg-bg-card transition-colors duration-150", className)} {...rest}>
      {children}
    </tr>
  );
}

function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cx("text-left font-bold text-text bg-bg-card px-4 py-2.5 text-[13px] whitespace-nowrap", className)} {...rest}>
      {children}
    </th>
  );
}

function Td({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx("text-text px-4 py-2.5 text-[13px] align-middle border-b border-border", className)} {...rest}>
      {children}
    </td>
  );
}

export const Table = Object.assign(TableRoot, { Thead, Tbody, Tr, Th, Td });
