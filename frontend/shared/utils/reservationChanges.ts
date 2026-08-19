interface ComparableReservationValues {
  roomId: string;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  purpose: string;
  startAt: string;
  endAt: string;
}

function sameInstant(left: string, right: string): boolean {
  return new Date(left).getTime() === new Date(right).getTime();
}

export function hasReservationTimeChanges(
  current: Pick<ComparableReservationValues, 'startAt' | 'endAt'>,
  next: Pick<ComparableReservationValues, 'startAt' | 'endAt'>,
): boolean {
  return !sameInstant(current.startAt, next.startAt) || !sameInstant(current.endAt, next.endAt);
}

export function hasReservationValueChanges(
  current: ComparableReservationValues,
  next: ComparableReservationValues,
): boolean {
  return current.roomId !== next.roomId
    || current.applicantName !== next.applicantName
    || current.applicantEmail !== next.applicantEmail
    || current.applicantPhone !== next.applicantPhone
    || current.purpose !== next.purpose
    || hasReservationTimeChanges(current, next);
}
