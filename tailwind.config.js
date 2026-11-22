module.exports = {
  future: {
    hoverOnlyWhenSupported: true
  },
  theme: {
    extend: {
      colors: {
        // The three canonical brand colours daisyUI has no slot for (the other seven are the theme
        // below). Utilities: bg-integra-cream, text-integra-grey, bg-integra-plum-dark, …
        integra: {
          'plum-dark': '#34285A', // Plum dark — deep backgrounds
          grey: '#5F5A66', // Grey — secondary / muted text
          cream: '#FBF6EE' // Cream — card and band backgrounds
        }
      }
    }
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
          'base-200': '#EFEBE3', // derived, not a brand colour: midpoint of Paper #F7F4EF and Hairline #E6E1D6 (rounded up)
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
