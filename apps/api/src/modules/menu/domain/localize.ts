import type { CategoryTranslations, ItemTranslations, Language } from '@conciergeiq/contracts';

/** The item's name and description in `language`, falling back to the default text for anything not translated. */
export function localizeItem(
  item: { name: string; description: string | null; translations: ItemTranslations },
  language: Language,
): { name: string; description: string | null } {
  const translation = language === 'en' ? undefined : item.translations[language];
  return {
    name: translation?.name?.trim() || item.name,
    description: translation?.description?.trim() || item.description,
  };
}

export function localizeCategoryName(category: { name: string; translations: CategoryTranslations }, language: Language): string {
  const translation = language === 'en' ? undefined : category.translations[language];
  return translation?.name?.trim() || category.name;
}
