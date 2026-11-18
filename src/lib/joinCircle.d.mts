export const INVITE_CODE_LENGTH: number
export const JOIN_TIMEOUT_MS: number
export function canJoinWithCode(state: { hasCircle: boolean; role?: string | null; memberCount?: number | null }): boolean
export function isCompleteInviteCode(raw: string): boolean
export type JoinResult = { status: 'joined' | 'error' | 'ignored'; message?: string }
export function createJoinSubmitter(
  acceptInvite: (code: string) => PromiseLike<{ data: unknown; error: unknown }>,
  mapError: (error: unknown) => string,
  options?: { timeoutMs?: number },
): (raw: string) => Promise<JoinResult>
