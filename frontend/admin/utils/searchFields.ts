export const reservationSearchOptions = [
  { value: 'all', label: '전체' },
  { value: 'purpose', label: '신청 목적' },
  { value: 'applicantName', label: '신청자 이름' },
  { value: 'applicantPhone', label: '전화번호' },
  { value: 'applicantEmail', label: '이메일' },
  { value: 'memo', label: '처리 메모' },
] as const;

export const auditSearchOptions = [
  ...reservationSearchOptions,
  { value: 'roomName', label: '공간명' },
  { value: 'actor', label: '처리자' },
] as const;

export const recurrenceSearchOptions = [
  { value: 'all', label: '전체' },
  { value: 'purpose', label: '신청 목적' },
  { value: 'applicantName', label: '신청자 이름' },
  { value: 'roomName', label: '공간명' },
  { value: 'tagName', label: '태그명' },
] as const;

export const roomSearchOptions = [
  { value: 'all', label: '전체' },
  { value: 'name', label: '공간명' },
  { value: 'location', label: '위치' },
  { value: 'description', label: '설명' },
] as const;

export function normalizeSearchField<T extends string>(
  value: string | null,
  options: readonly { value: T; label: string }[],
): T {
  return options.find((option) => option.value === value)?.value ?? options[0].value;
}
