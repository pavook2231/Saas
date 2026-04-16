'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  avatarLabel?: string;
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 20);
  }, [open]);

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

  const availableOptions = useMemo(
    () => filteredOptions.filter((option) => !value.includes(option.value)),
    [filteredOptions, value],
  );

  const toggleValue = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
      setQuery('');
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return;
    }

    onChange([...value, optionValue]);
    setQuery('');
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
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
            selectedOptions.slice(0, 4).map((option) => (
              <span key={option.value} className="ui-multiselect__tag">
                {option.label}
              </span>
            ))
          ) : (
            <span className="ui-multiselect__placeholder">{placeholder}</span>
          )}
          {selectedOptions.length > 4 ? (
            <span className="ui-multiselect__tag ui-multiselect__tag--count">+{selectedOptions.length - 4}</span>
          ) : null}
        </div>
        <span className="ui-multiselect__chevron">{open ? '▴' : '▾'}</span>
      </button>

      {open ? (
        <div className="ui-multiselect__panel">
          <input
            ref={searchInputRef}
            className="ui-field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
          />

          {selectedOptions.length > 0 ? (
            <div className="ui-multiselect__selected">
              <div className="ui-multiselect__section-head">
                <strong>Выбрано</strong>
                <span>{selectedOptions.length}</span>
              </div>
              <div className="ui-multiselect__selected-tags">
                {selectedOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="ui-multiselect__selected-tag"
                    onClick={() => toggleValue(option.value)}
                  >
                    <span>{option.label}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ui-multiselect__options">
            {availableOptions.length > 0 ? (
              availableOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="ui-multiselect__option"
                  onClick={() => toggleValue(option.value)}
                >
                  <div className="ui-multiselect__option-main">
                    {option.avatarLabel ? <Avatar size="sm" name={option.avatarLabel} /> : null}
                    <div className="ui-multiselect__option-copy">
                      <strong>{option.label}</strong>
                      {option.description ? <span>{option.description}</span> : null}
                    </div>
                  </div>
                  <div className="ui-multiselect__option-side">
                    {option.badge ? <small>{option.badge}</small> : null}
                    <span className="ui-multiselect__option-action">Добавить</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="ui-multiselect__empty">{emptyText}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
