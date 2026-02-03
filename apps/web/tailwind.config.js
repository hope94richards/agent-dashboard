/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        panel: "#1a1d23",
        panel2: "#171a20",
        panel3: "#13161b",
        accent: "#7a5cff",
        muted: "#a0a4ad",
        bg: "#0f1115"
      },
      boxShadow: {
        card: "0 0 0 1px #222 inset, 0 10px 30px rgba(0,0,0,.25)",
        avatar: "0 0 0 6px #1a1d23, 0 0 32px rgba(122,92,255,.35)"
      }
    }
  },
  plugins: []
};
