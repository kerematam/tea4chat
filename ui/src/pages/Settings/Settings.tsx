import {
  Box,
  Typography,
  Container,
  Card,
  CardContent,
  Avatar,
  Grid,
  Chip,
  Skeleton,
  Button,
} from "@mui/material";
import { trpc } from "../../services/trpc";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import ApiKeysCard from "./components/ApiKeysCard/ApiKeysCard";
import ChatDataCard from "./components/ChatDataCard/ChatDataCard";
import AnonymousSessionSync from "./components/AnonymousSessionSync/AnonymousSessionSync";
import ThemeCard from "./components/ThemeCard/ThemeCard";
import { authClient } from "@/services/auth/authClient";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const { data: profile, isLoading, error } = trpc.profile.useQuery();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const navigate = useNavigate();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Settings
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your account and application preferences
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Left Sidebar - Profile Card */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: "fit-content", position: "sticky", top: 24 }}>
            <CardContent>
              <Typography
                variant="h6"
                gutterBottom
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <PersonIcon />
                Profile
              </Typography>

              {isLoading ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Skeleton variant="circular" width={80} height={80} />
                    <Box sx={{ textAlign: "center", width: "100%" }}>
                      <Skeleton
                        variant="text"
                        width="80%"
                        height={24}
                        sx={{ mx: "auto" }}
                      />
                      <Skeleton
                        variant="text"
                        width="100%"
                        height={20}
                        sx={{ mx: "auto" }}
                      />
                    </Box>
                  </Box>
                  <Skeleton variant="text" width="60%" height={20} />
                </Box>
              ) : error || !profile?.authenticated ? (
                <Typography
                  color="text.secondary"
                  variant="body2"
                  textAlign="center"
                >
                  Please sign in to view your profile information.
                </Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Avatar sx={{ width: 80, height: 80 }}>
                      {profile.user?.name?.[0]?.toUpperCase() ||
                        profile.user?.email?.[0]?.toUpperCase() ||
                        "U"}
                    </Avatar>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography variant="h6" gutterBottom>
                        {profile.user?.name || "No name set"}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 0.5,
                        }}
                      >
                        <EmailIcon fontSize="small" />
                        {profile.user?.email}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="error"
                        onClick={() => {
                          // Clear all query cache before signing out
                          queryClient.clear();
                          utils.invalidate();
                          authClient.signOut();
                          navigate("/"); 
                        }}
                        sx={{ width: "100%", maxWidth: "200px" }}
                      >
                        Sign Out
                      </Button>
                    </Box>
                  </Box>

                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    {profile.authenticated &&
                      "isAdmin" in profile &&
                      profile.isAdmin && (
                        <Chip
                          icon={<AdminPanelSettingsIcon />}
                          label="Admin"
                          color="primary"
                          variant="outlined"
                          size="small"
                          sx={{ alignSelf: "center" }}
                        />
                      )}
                    <Chip
                      label="Authenticated"
                      color="success"
                      variant="outlined"
                      size="small"
                      sx={{ alignSelf: "center" }}
                    />
                  </Box>
                  <AnonymousSessionSync />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Main Content */}
        <Grid item xs={12} lg={8}>
          <Grid container spacing={3}>
            {/* Theme Preferences Card */}
            <Grid item xs={12}>
              <ThemeCard />
            </Grid>

            {/* API Keys Management Card */}
            <Grid item xs={12}>
              <ApiKeysCard />
            </Grid>

            {/* Chat Data Management Card */}
            <Grid item xs={12}>
              <ChatDataCard />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Settings;
