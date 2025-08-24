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

// Brand colors - Rich red palette
export const brandColors = {
  primary: "#A82A24", // Rich red
  secondary: "#EAB308", // Golden yellow
  accent: "#C93B35", // Lighter red
  success: "#16A34A", // Green
  warning: "#F59E0B", // Amber
  error: "#DC2626", // Red
  gold: "#FBBF24", // Rich gold
};

const lightTheme = createTheme({
  ...commonThemeOptions,
  palette: {
    mode: "light",
    primary: {
      main: "#A82A24", // Rich red
      light: "#C93B35",
      dark: "#871217",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#EAB308", // Golden yellow
      light: "#FDE047",
      dark: "#CA8A04",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#FEF5F5", // Very light red tint
      paper: "#FFFFFF",
    },
    text: {
      primary: "#2D1B1B", // Dark reddish brown
      secondary: "#7A2E2E", // Medium red brown
    },
    divider: "#A82A241F", // Light red divider
    action: {
      hover: "rgba(168, 42, 36, 0.04)",
      selected: "rgba(168, 42, 36, 0.08)",
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
      main: "#C93B35", // Rich red (lighter for dark theme)
      light: "#E54C46",
      dark: "#A82A24",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#FDE047", // Bright golden yellow
      light: "#FEF3C7",
      dark: "#EAB308",
      contrastText: "#1F1600",
    },
    background: {
      default: "#1A0E0E", // Dark red-tinted background
      paper: "#2D1B1B", // Dark red-tinted paper
    },
    text: {
      primary: "#FFF5F5", // Very light pinkish white
      secondary: "#FECACA", // Light red tint
    },
    divider: "#7A2E2E", // Dark red divider
    action: {
      hover: "rgba(201, 59, 53, 0.08)", // Rich red hover
      selected: "rgba(201, 59, 53, 0.12)",
      disabled: "rgba(168, 42, 36, 0.3)",
      disabledBackground: "rgba(168, 42, 36, 0.12)",
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
    backgroundColor: "rgba(26, 14, 14, 0.8)",
  };
}

export { darkTheme, lightTheme };

