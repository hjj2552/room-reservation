import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  includeExistingTime,
  reservationEndTimeOptions,
  reservationStartTimeOptions,
} from '../utils/timeOptions';

interface TimeRangeSelectProps {
  startTime: string;
  endTime: string;
  openTime: string;
  closeTime: string;
  minReservationMinutes: number;
  maxReservationMinutes: number;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  startTestId?: string;
  endTestId?: string;
  startError?: ReactNode;
  endError?: ReactNode;
  startInvalid?: boolean;
  endInvalid?: boolean;
  startDescribedBy?: string;
  endDescribedBy?: string;
  disabled?: boolean;
}

export function TimeRangeSelect({
  startTime,
  endTime,
  openTime,
  closeTime,
  minReservationMinutes,
  maxReservationMinutes,
  onStartTimeChange,
  onEndTimeChange,
  startTestId,
  endTestId,
  startError,
  endError,
  startInvalid,
  endInvalid,
  startDescribedBy,
  endDescribedBy,
  disabled,
}: TimeRangeSelectProps) {
  const startOptions = useMemo(
    () => includeExistingTime(
      reservationStartTimeOptions(openTime, closeTime, minReservationMinutes),
      startTime,
    ),
    [closeTime, minReservationMinutes, openTime, startTime],
  );
  const validEndOptions = useMemo(
    () => reservationEndTimeOptions(
      startTime,
      closeTime,
      minReservationMinutes,
      maxReservationMinutes,
    ),
    [closeTime, maxReservationMinutes, minReservationMinutes, startTime],
  );
  const endOptions = useMemo(
    () => includeExistingTime(validEndOptions, endTime),
    [endTime, validEndOptions],
  );

  function changeStart(nextStart: string) {
    onStartTimeChange(nextStart);
    const nextEndOptions = reservationEndTimeOptions(
      nextStart,
      closeTime,
      minReservationMinutes,
      maxReservationMinutes,
    );
    if (endTime && !nextEndOptions.some((option) => option.value === endTime)) {
      onEndTimeChange('');
    }
  }

  return (
    <>
      <label>
        시작 시간
        <select
          data-testid={startTestId}
          value={startTime}
          onChange={(event) => changeStart(event.target.value)}
          aria-invalid={startInvalid || undefined}
          aria-describedby={startDescribedBy}
          disabled={disabled}
          required
        >
          <option value="">선택</option>
          {startOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {startError}
      </label>
      <label>
        종료 시간
        <select
          data-testid={endTestId}
          value={endTime}
          onChange={(event) => onEndTimeChange(event.target.value)}
          aria-invalid={endInvalid || undefined}
          aria-describedby={endDescribedBy}
          disabled={disabled || !startTime}
          required
        >
          <option value="">선택</option>
          {endOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {endError}
      </label>
    </>
  );
}

interface ReservationTimeRangeInputProps extends Omit<TimeRangeSelectProps,
  'startTime' | 'endTime' | 'onStartTimeChange' | 'onEndTimeChange' | 'disabled'> {
  startAt: string;
  endAt: string;
  onStartAtChange: (value: string) => void;
  onEndAtChange: (value: string) => void;
  dateTestId?: string;
}

function datePart(value: string) {
  return value.match(/^(\d{4}-\d{2}-\d{2})T/)?.[1] || '';
}

function timePart(value: string) {
  return value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/)?.[1] || '';
}

function combine(date: string, time: string) {
  return date && time ? `${date}T${time}` : '';
}

export function ReservationTimeRangeInput({
  startAt,
  endAt,
  onStartAtChange,
  onEndAtChange,
  dateTestId,
  ...timeProps
}: ReservationTimeRangeInputProps) {
  const externalDate = datePart(startAt) || datePart(endAt);
  const [selectedDate, setSelectedDate] = useState(externalDate);
  const startTime = timePart(startAt);
  const endTime = timePart(endAt);

  useEffect(() => {
    if (externalDate) setSelectedDate(externalDate);
  }, [externalDate]);

  function changeDate(nextDate: string) {
    setSelectedDate(nextDate);
    onStartAtChange(combine(nextDate, startTime));
    onEndAtChange(combine(nextDate, endTime));
  }

  return (
    <>
      <label>
        예약 날짜
        <input
          type="date"
          data-testid={dateTestId}
          value={selectedDate}
          onChange={(event) => changeDate(event.target.value)}
          required
        />
      </label>
      <TimeRangeSelect
        {...timeProps}
        startTime={startTime}
        endTime={endTime}
        onStartTimeChange={(value) => onStartAtChange(combine(selectedDate, value))}
        onEndTimeChange={(value) => onEndAtChange(combine(selectedDate, value))}
        disabled={!selectedDate}
      />
    </>
  );
}
