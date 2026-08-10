import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        shell: "#f5f7fb",
        line: "#dce3ee",
        aeo: {
          blue: "#2563eb",
          teal: "#0f766e",
          green: "#15803d",
          gold: "#b7791f",
          red: "#dc2626",
          violet: "#7c3aed"
        }
      },
      boxShadow: {
        soft: "0 14px 40px rgba(25, 38, 64, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
