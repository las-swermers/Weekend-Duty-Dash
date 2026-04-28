import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#093554",
        navyAlt: "#1a4a6b",
        teal: "#145d7a",
        orange: "#ea6733",
        burnt: "#d43b1b",
        burgundy: "#a42547",
        paper: "#fafaf7",
        paper2: "#f3f1ec",
        paper3: "#ebe7df",
        rule: "#d8d3c8",
      },
      fontFamily: {
        serif: [
          "Archivo",
          "Roc Grotesk",
          "Avenir Next",
          "Avenir",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        sans: [
          "Nunito Sans",
          "Avenir Next",
          "Avenir",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
