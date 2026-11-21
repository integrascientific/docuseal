module.exports = {
  future: {
    hoverOnlyWhenSupported: true
  },
  plugins: [
    require('daisyui')
  ],
  daisyui: {
    themes: [
      {
        docuseal: {
          'color-scheme': 'light',
          // Integra Scientific brand tokens (see INTEGRA-BRANDING.md).
          // The theme key stays "docuseal": it is an internal id used by data-theme.
          primary: '#D9D3E8', // Lilac
          secondary: '#D4B26C', // Gold light
          accent: '#C5A059', // Gold
          neutral: '#4B3F72', // Plum
          'base-100': '#F7F4EF', // Paper
          'base-200': '#EFEBE3', // Paper/Hairline midpoint
          'base-300': '#E6E1D6', // Hairline
          'base-content': '#131B2C', // Ink
          '--rounded-btn': '1.9rem',
          '--tab-border': '2px',
          '--tab-radius': '.5rem'
        }
      }
    ]
  }
}
