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
        // Resting surfaces: a crisp contact line over a soft ambient halo.
        panel:
          "0 1px 2px -1px rgb(var(--flaque-shadow-rgb) / 0.12), 0 18px 38px -28px rgb(var(--flaque-shadow-rgb) / 0.42)",
        // Lifted / hovered surfaces.
        lift:
          "0 2px 6px -2px rgb(var(--flaque-shadow-rgb) / 0.16), 0 22px 44px -26px rgb(var(--flaque-shadow-rgb) / 0.5)",
        // Floating layers: modals, popovers, menus.
        elevated:
          "0 6px 14px -6px rgb(var(--flaque-shadow-rgb) / 0.22), 0 36px 60px -30px rgb(var(--flaque-shadow-rgb) / 0.6)"
      },
      transitionTimingFunction: {
        // Shared spring-like easing, mirrors the tactile radio controls.
        swift: "cubic-bezier(0.2, 0.8, 0.2, 1)"
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "rise-in": "rise-in 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both"
      }
    }
  },
  plugins: []
};
