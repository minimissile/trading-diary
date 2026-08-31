import { Input } from 'antd';
import type { InputProps } from 'antd';
import { useState } from 'react';
import {
  isIncompleteDecimalInput,
  isPartialDecimalInput,
  parseOptionalNumber,
} from '../../lib/parse-optional-number';

interface EditableDecimalInputProps extends Omit<InputProps, 'value' | 'onChange'> {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
}

function formatDecimalValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * 表格内可编辑小数输入：输入过程中保留「2.」等中间态，失焦后再规范化。
 */
export function EditableDecimalInput({
  value,
  onValueChange,
  onBlur,
  onFocus,
  onPressEnter,
  ...rest
}: EditableDecimalInputProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const flushDraft = (raw: string): void => {
    const parsed = parseOptionalNumber(raw);
    onValueChange(parsed);
    setDraft(formatDecimalValue(parsed));
  };

  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={focused ? draft : formatDecimalValue(value)}
      onChange={(event) => {
        const raw = event.target.value;
        if (!isPartialDecimalInput(raw)) return;
        setDraft(raw);
        if (isIncompleteDecimalInput(raw)) return;
        onValueChange(parseOptionalNumber(raw));
      }}
      onFocus={(event) => {
        setDraft(formatDecimalValue(value));
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        flushDraft(draft);
        onBlur?.(event);
      }}
      onPressEnter={(event) => {
        flushDraft(draft);
        onPressEnter?.(event);
      }}
    />
  );
}
