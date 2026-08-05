import type { ConflictPolicy } from '../../shared/api/types';
import { canonicalizeWeekdayCodes } from '../../shared/utils/weekdays';

export interface RecurrencePreviewFingerprintInput {
  roomId: string;
  startDate: string;
  endDate: string;
  daysOfWeek: readonly string[];
  startTime: string;
  endTime: string;
  conflictPolicy: ConflictPolicy;
}

function normalizeTime(value: string) {
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  return match ? `${match[1]}:${match[2]}:${match[3] || '00'}` : trimmed;
}

export function recurrencePreviewFingerprint(input: RecurrencePreviewFingerprintInput) {
  return JSON.stringify([
    input.roomId,
    input.startDate,
    input.endDate,
    canonicalizeWeekdayCodes(input.daysOfWeek),
    normalizeTime(input.startTime),
    normalizeTime(input.endTime),
    input.conflictPolicy,
  ]);
}
