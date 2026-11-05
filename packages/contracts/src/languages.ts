import { z } from 'zod';

/**
 * Languages the guest app can be shown in. English is the default and is
 * always on; hotels turn the others on in Settings.
 */
export const Language = {
  EN: 'en',
  FR: 'fr',
  HA: 'ha',
  YO: 'yo',
  AR: 'ar',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'fr', 'ha', 'yo', 'ar'];
export const DEFAULT_LANGUAGE: Language = 'en';

/** Each language's name in itself, for the guest language picker. */
export const LANGUAGE_NATIVE_NAME: Record<Language, string> = {
  en: 'English',
  fr: 'Français',
  ha: 'Hausa',
  yo: 'Yorùbá',
  ar: 'العربية',
};

export const RIGHT_TO_LEFT_LANGUAGES: readonly Language[] = ['ar'];

export const LanguageSchema = z.enum(['en', 'fr', 'ha', 'yo', 'ar']);
/** Languages a translation can be written in: every one except the default. */
export const TranslatedLanguageSchema = z.enum(['fr', 'ha', 'yo', 'ar']);

/** Picks the best of the hotel's languages for a requested one, e.g. `fr-CA` → `fr`. */
export function resolveLanguage(requested: string | undefined | null, enabled: readonly Language[]): Language {
  const base = (requested ?? '').toLowerCase().split(/[-_]/)[0];
  return (enabled.find((language) => language === base) ?? DEFAULT_LANGUAGE) as Language;
}
