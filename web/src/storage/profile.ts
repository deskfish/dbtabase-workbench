const PROFILE_KEY = 'dbw-profile'

/** 本地用户资料，仅用于展示昵称 */
export type Profile = {
  /** 用户昵称 */
  nickname: string
}

export function getProfile(): Profile | null {
  const raw = localStorage.getItem(PROFILE_KEY)
  if (!raw) return null
  try {
    const profile = JSON.parse(raw) as Profile
    if (!profile.nickname?.trim()) return null
    return {nickname: profile.nickname.trim()}
  } catch {
    return null
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({nickname: profile.nickname.trim()}))
}

export function clearProfile(): void {
  localStorage.removeItem(PROFILE_KEY)
}
