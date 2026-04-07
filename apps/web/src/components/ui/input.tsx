import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, id, ...props },
  ref,
) {
  const inputId = id ?? props.name ?? props.placeholder ?? undefined;

  if (!label) {
    return (
      <input
        ref={ref}
        id={inputId}
        className={cn('ui-field', error && 'ui-field--error', className)}
        {...props}
      />
    );
  }

  return (
    <label className="ui-field-group" htmlFor={inputId}>
      <span className="ui-field-group__label">{label}</span>
      <input
        ref={ref}
        id={inputId}
        className={cn('ui-field', error && 'ui-field--error', className)}
        {...props}
      />
      {error ? <span className="ui-field-group__error">{error}</span> : null}
      {!error && hint ? <span className="ui-field-group__hint">{hint}</span> : null}
    </label>
  );
});
