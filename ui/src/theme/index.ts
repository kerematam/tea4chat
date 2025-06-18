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

// Brand colors
export const brandColors = {
  primary: "#3B82F6", // Modern blue
  secondary: "#8B5CF6", // Purple accent
  accent: "#F59E0B", // Warm amber
  success: "#10B981", // Green
  warning: "#F59E0B", // Amber
  error: "#EF4444", // Red
  gold: "#F0D174", // Refined gold
};

const lightTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: "light",
    primary: {
      main: brandColors.primary,
      light: "#60A5FA",
      dark: "#1D4ED8",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: brandColors.secondary,
      light: "#A78BFA",
      dark: "#7C3AED",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#FAFBFC",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1F2937",
      secondary: "#6B7280",
    },
    divider: "#E5E7EB",
    success: {
      main: brandColors.success,
      light: "#34D399",
      dark: "#059669",
    },
    warning: {
      main: brandColors.warning,
      light: "#FBBF24",
      dark: "#D97706",
    },
    error: {
      main: brandColors.error,
      light: "#F87171",
      dark: "#DC2626",
    },
  },
});

const darkTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: "dark",
    primary: {
      main: brandColors.primary,
      light: "#60A5FA",
      dark: "#1E3A8A",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: brandColors.secondary,
      light: "#A78BFA",
      dark: "#6D28D9",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#0F172A",
      paper: "#1E293B",
    },
    text: {
      primary: "#F8FAFC",
      secondary: "#CBD5E1",
    },
    divider: "#334155",
    success: {
      main: brandColors.success,
      light: "#34D399",
      dark: "#047857",
    },
    warning: {
      main: brandColors.warning,
      light: "#FBBF24",
      dark: "#B45309",
    },
    error: {
      main: brandColors.error,
      light: "#F87171",
      dark: "#B91C1C",
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
