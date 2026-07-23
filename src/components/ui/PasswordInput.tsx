import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Field, IconButton } from "@kaistrum/stratum-ui";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  wrapperClassName?: string;
}

/**
 * Stratum's Input has no built-in show/hide toggle, and its `trailingIcon`
 * slot is rendered `pointer-events-none` (decorative only) — so this
 * composes Field + a manual input directly, matching Input's own visual
 * classes, with a real interactive IconButton overlaid for the toggle.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { label, hint, error, required, wrapperClassName, className, id, ...rest },
  ref
) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error} required={required} className={wrapperClassName}>
      {(fieldId: string, describedBy: string | undefined) => (
        <div className="relative flex items-center">
          <input
            ref={ref}
            id={fieldId}
            type={visible ? "text" : "password"}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            className={[
              "w-full bg-bg-surface border text-text text-sm rounded-none px-4 py-3.5 pr-11 outline-none transition-colors duration-200 placeholder:text-text-muted disabled:opacity-50 disabled:cursor-not-allowed",
              error ? "border-danger" : "border-border focus:border-accent",
              className ?? "",
            ]
              .filter(Boolean)
              .join(" ")}
            {...rest}
          />
          <IconButton
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            variant="ghost"
            size="sm"
            icon={visible ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            onClick={() => setVisible((v) => !v)}
            tabIndex={-1}
            className="absolute right-1.5"
          />
        </div>
      )}
    </Field>
  );
});
