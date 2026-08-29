import { DatePicker, type DatePickerProps } from 'antd';

export type TradeDatePickerProps = Omit<DatePickerProps, 'showTime' | 'format' | 'picker'>;

/**
 * 成交日期选择器：仅年月日，不含时分秒。
 */
export function TradeDatePicker({ className, placeholder = '选择日期', ...rest }: TradeDatePickerProps) {
  return (
    <DatePicker
      {...rest}
      className={className}
      format="YYYY-MM-DD"
      picker="date"
      placeholder={placeholder}
      popupClassName="td-trade-date-picker"
    />
  );
}
