export type ThemeId = 'dark' | 'slate' | 'light' | 'paper' | 'ocean'

export type ThemeOption = {
  id: ThemeId
  label: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  {id: 'dark', label: '深空黑'},
  {id: 'slate', label: '石墨灰'},
  {id: 'light', label: '云白'},
  {id: 'paper', label: '暖纸色'},
  {id: 'ocean', label: '浅海蓝'},
]

const THEME_KEY = 'dbw-theme'

export function getTheme(): ThemeId {
  const raw = localStorage.getItem(THEME_KEY)
  if (THEME_OPTIONS.some((item) => item.id === raw)) return raw as ThemeId
  return 'light'
}

export function saveTheme(theme: ThemeId): void {
  localStorage.setItem(THEME_KEY, theme)
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
}

export function editorThemeFor(theme: ThemeId): 'vs-dark' | 'vs-light' {
  return theme === 'dark' || theme === 'slate' ? 'vs-dark' : 'vs-light'
}

export function isDarkTheme(theme: ThemeId): boolean {
  return theme === 'dark' || theme === 'slate'
}
