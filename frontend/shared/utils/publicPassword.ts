export const publicPasswordHelp = '수정 및 취소용 비밀번호를 4자 이상 입력해 주세요.';
export const publicPasswordBlockedMessage = '한글과 공백은 사용할 수 없습니다.';
export const publicPasswordPattern = /^[\x21-\x7E]{4,64}$/;
export const publicPasswordCharactersPattern = /^[\x21-\x7E]*$/;

export function acceptsPublicPasswordInput(value: string) {
  return value.length <= 64 && publicPasswordCharactersPattern.test(value);
}
