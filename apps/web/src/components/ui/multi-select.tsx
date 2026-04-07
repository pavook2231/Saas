'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
};

type MultiSelectProps = {
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  value: string[];
  options: MultiSelectOption[];
  onChange: (value: string[]) => void;
};

export function MultiSelect({
  label,
  placeholder = 'Выберите значения',
  searchPlaceholder = 'Поиск...',
  emptyText = 'Ничего не найдено',
  value,
  options,
  onChange,
}: MultiSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const selectedOptions = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return options;
    }

    return options.filter((option) => {
      return (
        option.label.toLowerCase().includes(normalized) ||
        option.description?.toLowerCase().includes(normalized)
      );
    });
  }, [options, query]);

  const toggleValue = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      return;
    }

    onChange([...value, optionValue]);
  };

  return (
    <div className="ui-field-group" ref={rootRef}>
      {label ? <span className="ui-field-group__label">{label}</span> : null}

      <button
        type="button"
        className={cn('ui-multiselect', open && 'is-open')}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="ui-multiselect__values">
          {selectedOptions.length > 0 ? (
            selectedOptions.map((option) => (
              <span key={option.value} className="ui-multiselect__tag">
                {option.label}
              </span>
            ))
          ) : (
            <span className="ui-multiselect__placeholder">{placeholder}</span>
          )}
        </div>
        <span className="ui-multiselect__chevron">{open ? '▴' : '▾'}</span>
      </button>

      {open ? (
        <div className="ui-multiselect__panel">
          <input
            className="ui-field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
          />

          <div className="ui-multiselect__options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const active = value.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn('ui-multiselect__option', active && 'is-active')}
                    onClick={() => toggleValue(option.value)}
                  >
                    <div>
                      <strong>{option.label}</strong>
                      {option.description ? <span>{option.description}</span> : null}
                    </div>
                    {option.badge ? <small>{option.badge}</small> : null}
                  </button>
                );
              })
            ) : (
              <p className="ui-multiselect__empty">{emptyText}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
