/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["IBM Plex Sans", "sans-serif"]
      },
      colors: {
        white: "rgb(var(--surface-rgb) / <alpha-value>)",
        flaque: {
          cream: "rgb(var(--flaque-cream-rgb) / <alpha-value>)",
          clay: "rgb(var(--flaque-clay-rgb) / <alpha-value>)",
          sand: "rgb(var(--flaque-sand-rgb) / <alpha-value>)",
          ink: "rgb(var(--flaque-ink-rgb) / <alpha-value>)",
          steel: "rgb(var(--flaque-steel-rgb) / <alpha-value>)"
        }
      },
      boxShadow: {
        panel: "0 24px 45px -35px rgb(var(--flaque-shadow-rgb) / 0.45)"
      }
    }
  },
  plugins: []
};
