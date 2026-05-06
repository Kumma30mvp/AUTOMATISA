import { forwardRef, type TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, error, hint, id, className = "", ...props },
    ref
  ) {
    const textareaId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-navy-900"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          className={`min-h-[140px] resize-y rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm leading-relaxed text-navy-900 placeholder:text-muted focus:border-blue-accent focus:outline-none focus:ring-2 focus:ring-blue-accent/20 disabled:cursor-not-allowed disabled:bg-surface-100 ${
            error ? "border-red-500" : ""
          } ${className}`}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-muted">{hint}</p>
        )}
        {error && (
          <p id={`${textareaId}-error`} className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }
);
