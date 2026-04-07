import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, id, children, ...props },
  ref,
) {
  const selectId = id ?? props.name ?? undefined;

  if (!label) {
    return (
      <select
        ref={ref}
        id={selectId}
        className={cn('ui-field', 'ui-select', error && 'ui-field--error', className)}
        {...props}
      >
        {children}
      </select>
    );
  }

  return (
    <label className="ui-field-group" htmlFor={selectId}>
      <span className="ui-field-group__label">{label}</span>
      <select
        ref={ref}
        id={selectId}
        className={cn('ui-field', 'ui-select', error && 'ui-field--error', className)}
        {...props}
      >
        {children}
      </select>
      {error ? <span className="ui-field-group__error">{error}</span> : null}
      {!error && hint ? <span className="ui-field-group__hint">{hint}</span> : null}
    </label>
  );
});
