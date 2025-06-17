import { Box, Typography, Button, Container, Paper } from "@mui/material";
import { useNavigate } from "react-router-dom";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import HomeIcon from "@mui/icons-material/Home";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

const NotFound = () => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate("/");
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        textAlign="center"
      >
        <Paper
          elevation={3}
          sx={{
            p: 6,
            borderRadius: 3,
            width: "100%",
            maxWidth: 500,
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              mb: 3,
            }}
          >
            <SearchOffIcon
              sx={{
                fontSize: 80,
                color: "warning.main",
              }}
            />
          </Box>

          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: { xs: "4rem", sm: "6rem" },
              fontWeight: "bold",
              color: "warning.main",
              mb: 2,
            }}
          >
            404
          </Typography>

          <Typography
            variant="h4"
            component="h2"
            gutterBottom
            sx={{ mb: 2 }}
          >
            Page Not Found
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 4, lineHeight: 1.6 }}
          >
            The page you're looking for doesn't exist. It might have been moved,
            deleted, or you entered the wrong URL.
          </Typography>

          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: 2,
              justifyContent: "center",
            }}
          >
            <Button
              variant="contained"
              startIcon={<HomeIcon />}
              onClick={handleGoHome}
              size="large"
            >
              Go Home
            </Button>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={handleGoBack}
              size="large"
            >
              Go Back
            </Button>
          </Box>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 4 }}
          >
            If you believe this is an error, please check the URL or contact support.
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default NotFound; 