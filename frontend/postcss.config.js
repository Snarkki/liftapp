module.exports = {
    plugins: {
     '@tailwindcss/postcss': {},
     'autoprefixer': {}, // Handles vendor prefixes
     ...(process.env.NODE_ENV === 'production' ? { cssnano: {} } : {})

    },
  }