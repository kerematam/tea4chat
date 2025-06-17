import { createTheme, ThemeOptions } from "@mui/material/styles";

const commonThemeOptions: ThemeOptions = {
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 4,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          "&.MuiInputBase-multiline": {
            borderRadius: 4,
          },
          "& .MuiInputBase-input": {
            borderRadius: 4,
          },
        },
      },
    },
  },
};

// TODO: to be used as complimantory brand color
export const gold = "#F0E2A5";
// #F2E4A5

const lightTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2",
    },
    background: {
      default: "#f0f0f0",
      paper: "#e0e0e0",
    },
    text: {
      primary: "#333",
      secondary: "#555",
    },
  },
});

const darkTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: "dark",
    primary: {
      main: "#555",
      light: "#888",
    },
    background: {
      default: "#20222C",
      paper: "#2C2E38",
    },
    text: {
      primary: "#fff",
      secondary: "#ccc",
    },
  },
});

export { lightTheme, darkTheme };
