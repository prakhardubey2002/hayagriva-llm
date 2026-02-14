// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'hayagriva-llm',
  tagline: 'Structured LLM metadata for Node.js packages',

  // Build to repo root docs/ so GitHub Pages can deploy from "Deploy from a branch" → folder /docs
  outDir: '../docs',

  // For GitHub Pages project site: https://<user>.github.io/<repo>/
  url: 'https://prakhardubey2002.github.io',
  baseUrl: '/hayagriva-llm/',
  organizationName: 'prakhardubey2002',
  projectName: 'hayagriva-llm',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          editUrl: undefined,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  markdown: {
    mermaid: true,
  },

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'hayagriva-llm',
        logo: {
          alt: 'hayagriva-llm',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Docs',
          },
          {
            href: 'https://github.com/prakhardubey2002/hayagriva-llm',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              { label: 'Introduction', to: '/' },
              { label: 'Flow & architecture', to: '/flow' },
              { label: 'Schema', to: '/schema' },
              { label: 'AI mode', to: '/ai-mode' },
            ],
          },
          {
            title: 'More',
            items: [
              { label: 'GitHub', href: 'https://github.com/prakhardubey2002/hayagriva-llm' },
              { label: 'npm', href: 'https://www.npmjs.com/package/hayagriva-llm' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} hayagriva-llm. MIT License.`,
      },
      prism: {
        theme: require('prism-react-renderer/themes/github'),
        darkTheme: require('prism-react-renderer/themes/dracula'),
      },
    }),
};

module.exports = config;
