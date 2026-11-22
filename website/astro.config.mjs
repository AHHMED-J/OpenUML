// The OpenUML website (openuml.org): English at the root, Spanish under /es/.
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://openuml.org',
  integrations: [
    starlight({
      title: 'OpenUML',
      description: 'Free, open-source UML, IDEF0 and RAD modeling for Windows, macOS and Linux.',
      favicon: '/favicon.png',
      logo: { src: './src/assets/logo.png', alt: '' },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        es: { label: 'Español', lang: 'es' }
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/AHHMED-J/OpenUML' }],
      customCss: ['./src/styles/custom.css'],
      components: { Footer: './src/components/Footer.astro', Hero: './src/components/Hero.astro' },
      sidebar: [
        { label: 'Download', translations: { es: 'Descargas' }, slug: 'download' },
        {
          label: 'Documentation',
          translations: { es: 'Documentación' },
          items: [
            { label: 'Getting started', translations: { es: 'Primeros pasos' }, slug: 'docs/getting-started' },
            { label: 'Tutorials', translations: { es: 'Tutoriales' }, slug: 'docs/tutorials' },
            { label: 'In your browser', translations: { es: 'En el navegador' }, slug: 'docs/browser' },
            { label: 'Diagram types', translations: { es: 'Tipos de diagrama' }, slug: 'docs/diagrams' },
            { label: 'Files (.mdj)', translations: { es: 'Archivos (.mdj)' }, slug: 'docs/files' }
          ]
        },
        {
          label: 'Guides',
          translations: { es: 'Guías' },
          items: [{ label: 'IDEF0', slug: 'guides/idef0' }]
        },
        {
          label: 'About',
          translations: { es: 'Acerca de' },
          items: [{ label: 'About OpenUML', translations: { es: 'Acerca de OpenUML' }, slug: 'about' }]
        }
      ]
    })
  ]
})
