import type { InputHTMLAttributes } from 'react';
import { normalizeSearchField } from '../utils/searchFields';

interface Props<T extends string> {
  options: readonly { value: T; label: string }[];
  searchField: T;
  keyword: string;
  onFieldChange: (value: T) => void;
  onKeywordChange: (value: string) => void;
  inputTestId: string;
  allPlaceholder: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

export function SearchFields<T extends string>({
  options, searchField, keyword, onFieldChange, onKeywordChange,
  inputTestId, allPlaceholder, inputProps,
}: Props<T>) {
  const label = options.find((option) => option.value === searchField)!.label;
  return (
    <div className="search-fields">
      <label>
        검색 대상
        <select
          data-testid={`${inputTestId}-search-field`}
          value={searchField}
          onChange={(event) => onFieldChange(normalizeSearchField(event.target.value, options))}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        검색어
        <input
          {...inputProps}
          type="search"
          data-testid={inputTestId}
          aria-label={`${label} 검색어`}
          placeholder={searchField === 'all' ? allPlaceholder : `${label} 입력`}
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
        />
      </label>
    </div>
  );
}
