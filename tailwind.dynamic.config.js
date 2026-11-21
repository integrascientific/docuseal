const path = require('path')

module.exports = {
  future: {
    hoverOnlyWhenSupported: true
  },
  content: [
    path.resolve(__dirname, 'app/javascript/template_builder/dynamic_area.vue'),
    path.resolve(__dirname, 'app/javascript/template_builder/dynamic_section.vue')
  ],
  theme: {
    extend: {
      colors: {
        'base-100': '#F7F4EF',
        'base-200': '#EFEBE3',
        'base-300': '#E6E1D6',
        'base-content': '#131B2C'
      }
    }
  }
}
