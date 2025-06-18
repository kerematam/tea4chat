import {
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Box,
  Divider,
  Chip,
} from "@mui/material";
import { Palette, DarkMode, LightMode } from "@mui/icons-material";
import { useTheme } from "../../../../theme/useTheme";

const ThemeCard = () => {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <Card>
      <CardContent>
        <Typography
          variant="h6"
          gutterBottom
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <Palette />
          Theme Preferences
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Customize the appearance of your interface
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={isDarkMode}
                onChange={toggleTheme}
                color="primary"
                size="medium"
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {isDarkMode ? (
                  <DarkMode fontSize="small" />
                ) : (
                  <LightMode fontSize="small" />
                )}
                <Typography variant="body1">
                  {isDarkMode ? "Dark Mode" : "Light Mode"}
                </Typography>
              </Box>
            }
            sx={{ m: 0 }}
          />

          <Divider />

          <Box sx={{ display: "flex", flex: 1, gap: 1, flexWrap: "wrap" }}>
            <Chip
              label="Modern Design"
              size="small"
              variant="outlined"
              color="primary"
            />
            <Chip
              label="Smooth Animations"
              size="small"
              variant="outlined"
              color="secondary"
            />
            <Chip
              label="Accessible Colors"
              size="small"
              variant="outlined"
              color="success"
            />
          </Box>

          <Typography variant="caption" color="text.secondary">
            Your theme preference is automatically saved and will be remembered
            across sessions.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ThemeCard;