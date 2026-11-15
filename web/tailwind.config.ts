import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f1b2d",
        paper: "#f7f5f0",
        card: "#ffffff",
        line: "#e7e3da",
        muted: "#4a5566",
        subtle: "#6b7686",
        accent: "#1d4ed8",
        ocean: "#eaf1f8",
        land: "#f7f4ec",
        good: "#15803d",
        bad: "#b42318",
        "route-plane": "#7c3aed",
        "route-ship": "#1d4ed8",
        "route-suez": "#dc4a3d",
        "route-rail": "#15803d",
        "route-shipair": "#d97706",
        "route-hub": "#0891b2",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        heading: ["var(--font-space-grotesk)", "var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
