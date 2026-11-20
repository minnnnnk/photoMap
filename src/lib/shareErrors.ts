/** Supabase에서 온 오류를 사용자에게 보여 줄 한국어 문장으로 바꾼다. */
export function shareErrorMessage(e: unknown): string {
  const err = (e ?? {}) as { message?: string; code?: string; status?: number; name?: string };
  const code = err.code ?? '';
  const message = err.message ?? String(e);

  if (code === 'over_email_send_rate_limit' || err.status === 429) {
    return '메일을 너무 자주 보냈어요. 잠시 후 다시 시도해 주세요.';
  }
  if (code === 'otp_expired' || code === 'invalid_credentials' || /token has expired or is invalid/i.test(message)) {
    return '코드가 맞지 않거나 만료됐어요. 메일의 코드를 다시 확인해 주세요.';
  }
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(message)) {
    return '이메일 주소를 다시 확인해 주세요.';
  }
  if (code === 'P0002') return '초대 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.';
  if (code === '42501') return '이 작업을 할 권한이 없어요.';
  if (code === '23514') return '입력한 내용이 너무 길거나 비어 있어요.';
  if (/network request failed|failed to fetch|fetch failed/i.test(message)) {
    return '인터넷 연결을 확인해 주세요.';
  }
  return message;
}
