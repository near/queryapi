module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#f7f9fb", //light white
        near: "#6be79f",
        nightmode: {
          primary: "#1e1e1e", //monaco editor dark
          secondary: "#bb85fb", //some light purple
          secondaryhover: "#3700b3" //some dark purple
        }
      },
    },
  },
  plugins: [],
};