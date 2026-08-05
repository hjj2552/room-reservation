import { expect, test } from '@playwright/test';
import type { ConflictPolicy } from '../../shared/api/types';
import { recurrencePreviewFingerprint } from '../../admin/utils/recurrencePreview';

const base = {
  roomId: 'room-a',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  daysOfWeek: ['TUE', 'WED', 'THU'],
  startTime: '10:00',
  endTime: '11:00',
  conflictPolicy: 'FAIL_ALL' as ConflictPolicy,
};

test('recurrence preview fingerprint canonicalizes weekdays and time precision', () => {
  expect(recurrencePreviewFingerprint(base)).toBe(recurrencePreviewFingerprint({
    ...base,
    daysOfWeek: ['THU', 'TUE', 'WED', 'THU'],
    startTime: '10:00:00',
    endTime: '11:00:00',
  }));
});

test('recurrence preview fingerprint changes only for preview condition fields', () => {
  const fingerprint = recurrencePreviewFingerprint({
    ...base,
    applicantName: 'First applicant',
    applicantEmail: 'first@example.test',
    applicantPhone: '010-1111-1111',
    purpose: 'First purpose',
    tagId: 'tag-a',
    showApplicantName: false,
  });
  expect(recurrencePreviewFingerprint({
    ...base,
    applicantName: 'Second applicant',
    applicantEmail: 'second@example.test',
    applicantPhone: '010-2222-2222',
    purpose: 'Second purpose',
    tagId: 'tag-b',
    showApplicantName: true,
  })).toBe(fingerprint);

  const changes = [
    { roomId: 'room-b' },
    { startDate: '2026-09-02' },
    { endDate: '2026-10-01' },
    { daysOfWeek: ['MON'] },
    { startTime: '10:05' },
    { endTime: '11:05' },
    { conflictPolicy: 'SKIP_CONFLICTS' as ConflictPolicy },
  ];
  for (const change of changes) {
    expect(recurrencePreviewFingerprint({ ...base, ...change })).not.toBe(fingerprint);
  }
});
