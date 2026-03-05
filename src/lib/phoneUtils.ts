import { parsePhoneNumberFromString } from 'libphonenumber-js'

/**
 * Normalizes any Israeli phone number format to E.164.
 *
 * Examples:
 *   '0521111111'       → '+972521111111'
 *   '052-111-1111'     → '+972521111111'
 *   '+972521111111'    → '+972521111111'
 *   '+972-52-111-1111' → '+972521111111'
 *   '972521111111'     → '+972521111111'
 *
 * Returns the original string (stripped of non-digits except +)
 * if parsing fails.
 */
export function normalizePhone(phone: string): string {
  // First try parsing with libphonenumber (handles all formats)
  const parsed = parsePhoneNumberFromString(phone, 'IL')
  if (parsed?.isValid()) {
    return parsed.format('E.164')
  }

  // Fallback: manual normalization for common Israeli patterns
  let digits = phone.replace(/[^0-9]/g, '')

  // 972XXXXXXXXX → +972XXXXXXXXX
  if (digits.startsWith('972') && digits.length >= 12) {
    return '+' + digits
  }

  // 0XXXXXXXXX → +972XXXXXXXXX (strip leading 0)
  if (digits.startsWith('0') && digits.length >= 10) {
    return '+972' + digits.slice(1)
  }

  // Already has + prefix, return as-is
  if (phone.startsWith('+')) {
    return '+' + digits
  }

  return phone
}
