import {
  Avatar,
  Box,
  IconButton,
  Divider,
  Typography,
  Tooltip,
  Button,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { authClient } from "@/services/auth/authClient";
import { useNavigate } from "react-router-dom";
import { persister, queryClient } from "../queryClient";

const UserInfoSection = () => {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const navigate = useNavigate();

  const handleSignUp = async () => {
    await authClient.signIn.social({
      provider: "google",
      disableRedirect: false,
    });
  };

  if (!session) {
    return (
      <Box sx={{ mt: "auto", width: "100%" }}>
        <Divider />
        <Box
          sx={{
            // backgroundColor: "#20222C",
            p: 2,
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              button: {
                backgroundColor: "primary.main",
                color: "primary.contrastText",
                textTransform: "none",
                "&:hover": {
                  backgroundColor: "primary.dark",
                },
                width: "100%",
              },
            }}
          >
            <Button
              onClick={() => {
                handleSignUp();
                persister.removeClient();
                queryClient.clear();
              }}
            >
              Sign in with Google
            </Button>
          </Box>
          <Button
            onClick={() => navigate("/settings")}
            variant="outlined"
            startIcon={<SettingsIcon />}
            sx={{
              width: "100%",
              color: "text.secondary",
              borderColor: "divider",
              "&:hover": {
                borderColor: "text.secondary",
                backgroundColor: "action.hover",
              },
            }}
          >
            Settings
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: "auto", width: "100%" }}>
      <Divider />
      <Box
        sx={{ p: 2, display: "flex", alignItems: "center", gap: 2, width: 300 }}
      >
        <Avatar
          src={user?.image || ""}
          alt={user?.name || "User"}
          sx={{ width: 32, height: 32 }}
        >
          {user?.name?.[0]?.toUpperCase() || "U"}
        </Avatar>
        <Box sx={{ flex: 1, width: 250, overflow: "hidden" }}>
          <Typography
            variant="subtitle2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {user?.name || "Username"}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {user?.email || "user@example.com"}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Tooltip title="Settings">
            <IconButton
              sx={{
                color: "text.secondary",
                "&:hover": {
                  color: "primary.main",
                  backgroundColor: "action.hover",
                },
              }}
              aria-label="settings"
              size="medium"
              onClick={() => navigate("/settings")}
            >
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};

export default UserInfoSection;
