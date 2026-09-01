const applicantPhonePattern = /^[0-9 -]+$/;

export function applicantPhoneError(value: string, required: boolean) {
  if (value === '') return required ? '전화번호를 입력해 주세요.' : undefined;
  if (value.length > 50) return '전화번호는 50자 이하로 입력해 주세요.';
  if (!applicantPhonePattern.test(value)) {
    return '전화번호는 숫자, 하이픈(-), 공백만 입력해 주세요.';
  }
  if (!/[0-9]/.test(value)) return '전화번호에 숫자를 입력해 주세요.';
  return undefined;
}

export function normalizeApplicantPhoneInput(value: string) {
  return value.replaceAll('-', '').replaceAll(' ', '');
}
