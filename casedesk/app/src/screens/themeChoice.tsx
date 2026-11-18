// Appearance choice (System / Dark / Light), stored in settings.
import { useFamily } from '../data/FamilyProvider';
import type { ThemeChoice } from '../ui';
export function useThemeChoice() {
  const f = useFamily();
  return { value: (f.settings.theme ?? 'system') as ThemeChoice, set: (v: ThemeChoice) => f.actions.updateSettings({ theme: v }) };
}
