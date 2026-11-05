/**
 * Normalises a phone number to E.164 (`+2348031234412`). Numbers written the
 * Nigerian way (`0803 123 4412`) are read as +234. Returns null when the
 * input cannot be a phone number.
 */
export function normalizePhone(input: string, defaultCountryCode = '234'): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const international = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('00')) digits = digits.slice(2);
  if (!international) {
    if (digits.startsWith('0')) digits = defaultCountryCode + digits.slice(1);
    else if (!digits.startsWith(defaultCountryCode)) return null;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

/** "+234 803 ••• 4412": enough to recognise the number without showing all of it. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 8) return e164;
  return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ••• ${digits.slice(-4)}`;
}
