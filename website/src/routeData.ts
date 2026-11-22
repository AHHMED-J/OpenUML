/**
 * Starlight route middleware: what search engines and link previews read in every page's <head>.
 * Every page gets the share picture (og:image, 1200×630, the app window and the logo). The home
 * pages are typed as a website, get their own title ("OpenUML | OpenUML" otherwise) and describe
 * OpenUML as a SoftwareApplication (schema.org JSON-LD) with the version of the app in this
 * repository.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data'
import { license, version } from '../../package.json'

const SITE = 'https://openuml.org'

const TEXT = {
  en: {
    imageAlt: 'OpenUML, a free UML, IDEF0 and RAD modeling tool, with a class diagram open',
    homeTitle: 'OpenUML: free, open-source UML and IDEF0 tool',
    home: '/',
    download: '/download/'
  },
  es: {
    imageAlt: 'OpenUML, herramienta gratuita de modelado UML, IDEF0 y RAD, con un diagrama de clases abierto',
    homeTitle: 'OpenUML: herramienta UML e IDEF0 gratis y de código abierto',
    home: '/es/',
    download: '/es/download/'
  }
}

/** schema.org JSON-LD for a <script> element: `<` escaped so text can never close the element. */
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute
  const lang = route.locale === 'es' ? 'es' : 'en'
  const t = TEXT[lang]
  const meta = (key: 'property' | 'name', name: string, content: string) => ({ tag: 'meta' as const, attrs: { [key]: name, content } })
  const replace = (key: 'property' | 'name', name: string, content: string): void => {
    route.head = route.head.filter((e) => !(e.tag === 'meta' && e.attrs?.[key] === name))
    route.head.push(meta(key, name, content))
  }

  replace('property', 'og:image', `${SITE}/og.jpg`)
  replace('property', 'og:image:width', '1200')
  replace('property', 'og:image:height', '630')
  replace('property', 'og:image:alt', t.imageAlt)
  replace('name', 'twitter:image', `${SITE}/og.jpg`)
  replace('name', 'twitter:image:alt', t.imageAlt)

  const isHome = route.id === '' || route.id === 'es'
  if (!isHome) return
  const description = route.entry.data.description ?? ''
  replace('property', 'og:type', 'website')
  route.head = route.head.filter((e) => e.tag !== 'title')
  route.head.push({ tag: 'title', content: t.homeTitle })
  replace('property', 'og:title', t.homeTitle)
  route.head.push({
    tag: 'script',
    attrs: { type: 'application/ld+json' },
    content: jsonLd({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'OpenUML',
      description,
      url: SITE + t.home,
      inLanguage: lang,
      applicationCategory: 'DesignApplication',
      operatingSystem: 'Windows, macOS, Linux, Web',
      softwareVersion: version,
      downloadUrl: SITE + t.download,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', url: SITE + t.download },
      isAccessibleForFree: true,
      license: license === 'MIT' ? 'https://opensource.org/licenses/MIT' : undefined,
      image: `${SITE}/logo.png`,
      screenshot: `${SITE}/og.jpg`,
      author: { '@type': 'Person', name: 'Ahhmed Jalife' },
      sameAs: ['https://github.com/AHHMED-J/OpenUML']
    })
  })
})
