import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'he', 'es', 'ru', 'ar', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'always',
})

export type Locale = (typeof routing.locales)[number]
