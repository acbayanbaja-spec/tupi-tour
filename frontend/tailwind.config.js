/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: "#1c3d2e", 50: "#eef6f1", 100: "#d5eadc", 800: "#163226" },
        gold: { DEFAULT: "#e2b13c", 600: "#c9961f" },
        moss: "#3d6b54",
        cream: "#f6f1e7",
        ink: "#14231c",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        lift: "0 18px 40px -24px rgba(20, 35, 28, 0.45)",
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem",
      },
    },
  },
  plugins: [],
};
