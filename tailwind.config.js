/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Lodge Suites brand palette
        ls: {
          deep: "#15161A",
          charcoal: "#1E2024",
          elev: "#26282E",
          panel: "#2D2F36",
          gold: "#C9A961",
          goldBright: "#DDC183",
          goldDeep: "#9A7E40",
          cream: "#F5F1E8",
          paper: "#FAF7F0",
          textOnDark: "#E8E2D4",
          textMuted: "#9B9588",
          textDim: "#6B665C",
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "serif"],
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
