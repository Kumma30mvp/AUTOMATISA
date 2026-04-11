import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  children: ReactNode;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, error, id, className = "", children, ...props },
    ref
  ) {
    const selectId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-navy-900"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? "true" : undefined}
          className={`rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm text-navy-900 focus:border-blue-accent focus:outline-none focus:ring-2 focus:ring-blue-accent/20 disabled:cursor-not-allowed disabled:bg-surface-100 ${
            error ? "border-red-500" : ""
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
