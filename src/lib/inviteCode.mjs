// Invitation codes are 48 lowercase hex characters (accept_couple_invite rejects anything else).
// People often paste the whole shared message, so prefer an exact 48-hex token found in the text.
export function normalizeInviteCode(input) {
  const text = String(input ?? '').toLowerCase()
  const token = text.match(/(?<![a-f0-9])[a-f0-9]{48}(?![a-f0-9])/)
  if (token) return token[0]
  return text.replace(/[^a-f0-9]/g, '').slice(0, 48)
}
