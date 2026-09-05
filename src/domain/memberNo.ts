/** Keep membership numbers as strings so IDs such as 000123 retain their zeroes. */
export function isValidMemberNo(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{6}$/.test(value)
}

export function validateMemberNo(value: string) {
  const memberNo = typeof value === 'string' ? value.trim() : ''
  if (!isValidMemberNo(memberNo)) throw new Error('会员编号必须是 6 位数字，不含字母')
  return memberNo
}
