import { createTheme, ThemeOptions } from "@mui/material/styles";

const commonThemeOptions: ThemeOptions = {
  typography: {
    fontFamily: '"Jura", "Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 600,
      fontSize: "2.5rem",
    },
    h2: {
      fontWeight: 600,
      fontSize: "2rem",
    },
    h3: {
      fontWeight: 500,
      fontSize: "1.5rem",
    },
    body1: {
      fontSize: "1rem",
      lineHeight: 1.6,
    },
    body2: {
      fontSize: "0.875rem",
      lineHeight: 1.5,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 8,
          fontWeight: 500,
          padding: "8px 16px",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            transform: "translateY(-1px)",
            boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
          },
        },
        contained: {
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
            },
            "&.Mui-focused": {
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          "&.MuiInputBase-multiline": {
            borderRadius: 8,
          },
          "& .MuiInputBase-input": {
            borderRadius: 8,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: "all 0.2s ease-in-out",
          "&:hover": {
            transform: "scale(1.05)",
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(8px)",
          backgroundColor: "rgba(255,255,255,0.8)",
        },
      },
    },
  },
};

// Brand colors - Warm palette
export const brandColors = {
  primary: "#F97316", // Warm orange
  secondary: "#EAB308", // Golden yellow
  accent: "#DC2626", // Warm red
  success: "#16A34A", // Warm green
  warning: "#F59E0B", // Amber
  error: "#DC2626", // Warm red
  gold: "#FBBF24", // Rich gold
};

const lightTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: "light",
    primary: {
      main: "#F97316", // Warm orange
      light: "#FB923C",
      dark: "#EA580C",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#EAB308", // Golden yellow
      light: "#FDE047",
      dark: "#CA8A04",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#FEF7ED", // Warm cream
      paper: "#FFFFFF",
    },
    text: {
      primary: "#451A03", // Warm dark brown
      secondary: "#92400E", // Warm brown
    },
    divider: "#FED7AA", // Warm peach divider
    action: {
      hover: "rgba(249, 115, 22, 0.04)",
      selected: "rgba(249, 115, 22, 0.08)",
      disabled: "rgba(69, 26, 3, 0.26)",
      disabledBackground: "rgba(69, 26, 3, 0.12)",
    },
    success: {
      main: "#16A34A", // Warm green
      light: "#22C55E",
      dark: "#15803D",
    },
    warning: {
      main: "#F59E0B", // Amber
      light: "#FBBF24",
      dark: "#D97706",
    },
    error: {
      main: "#DC2626", // Warm red
      light: "#EF4444",
      dark: "#B91C1C",
    },
  },
});

const darkTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: "dark",
    primary: {
      main: "#FB923C", // Warm orange (lighter for dark theme)
      light: "#FED7AA",
      dark: "#F97316",
      contrastText: "#1A0B05",
    },
    secondary: {
      main: "#FDE047", // Bright golden yellow
      light: "#FEF3C7",
      dark: "#EAB308",
      contrastText: "#1F1600",
    },
    background: {
      default: "#0F172A", // Keep user's preferred background
      paper: "#1F2937", // Warmer dark paper
    },
    text: {
      primary: "#FEF3C7", // Warm cream text
      secondary: "#D97706", // Warm amber secondary text
    },
    divider: "#92400E", // Warm brown divider
    action: {
      hover: "rgba(251, 146, 60, 0.08)", // Warm orange hover
      selected: "rgba(251, 146, 60, 0.12)",
      disabled: "rgba(217, 119, 6, 0.3)",
      disabledBackground: "rgba(217, 119, 6, 0.12)",
    },
    success: {
      main: "#22C55E", // Keep green pleasant
      light: "#4ADE80",
      dark: "#16A34A",
    },
    warning: {
      main: "#FBBF24", // Rich gold warning
      light: "#FDE047",
      dark: "#F59E0B",
    },
    error: {
      main: "#F87171", // Soft coral error
      light: "#FCA5A5",
      dark: "#DC2626",
    },
  },
});

// Override AppBar for dark theme
if (darkTheme.components?.MuiAppBar?.styleOverrides) {
  const existingRoot = darkTheme.components.MuiAppBar.styleOverrides.root || {};
  darkTheme.components.MuiAppBar.styleOverrides.root = {
    ...(typeof existingRoot === 'object' ? existingRoot : {}),
    backdropFilter: "blur(8px)",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
  };
}

export { lightTheme, darkTheme };
