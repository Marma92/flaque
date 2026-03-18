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
        flaque: {
          cream: "#fbf5ed",
          clay: "#e2c4a8",
          sand: "#d9b88a",
          ink: "#2c1f1a",
          steel: "#475569"
        }
      },
      boxShadow: {
        panel: "0 24px 45px -35px rgba(44, 31, 26, 0.35)"
      }
    }
  },
  plugins: []
};
