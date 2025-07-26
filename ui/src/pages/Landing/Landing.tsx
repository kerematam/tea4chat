import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import logo from "../../assets/tea4chat.png";

export default function Landing() {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate("/chat");
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={4} alignItems="center" textAlign="center">
          <Box>
            <img
              src={logo}
              alt="Tea 4 Chat"
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "auto",
              }}
            />
          </Box>
          
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontFamily: "Jura, sans-serif",
              fontWeight: "bold",
              color: "text.primary",
              textShadow: "2px 2px 4px rgba(0, 0, 0, 0.3)",
              mb: 2,
            }}
          >
            Tea 4 Chat
          </Typography>

          <Typography
            variant="h5"
            sx={{
              color: "text.secondary",
              mb: 4,
              maxWidth: "600px",
            }}
          >
            Experience the perfect blend of AI conversation and intelligent assistance
          </Typography>

          <Button
            variant="contained"
            size="large"
            onClick={handleGetStarted}
            sx={{
              px: 4,
              py: 2,
              fontSize: "1.2rem",
              borderRadius: 2,
              textTransform: "none",
            }}
          >
            Start Chatting
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}