import React, { useState } from "react";
import { AppBar, Toolbar, IconButton, Container, Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import ChatHistoryDrawer from "./components/ChatHistoryDrawer/ChatHistoryDrawer";
import Footer from "./components/Footer/Footer";

const CommonLayout = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer =
    (open: boolean) => (event: React.KeyboardEvent | React.MouseEvent) => {
      if (
        event.type === "keydown" &&
        ((event as React.KeyboardEvent).key === "Tab" ||
          (event as React.KeyboardEvent).key === "Shift")
      ) {
        return;
      }
      setDrawerOpen(open);
    };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: (theme) => theme.palette.background.default,
      }}
    >
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: "transparent",
          backgroundImage: "none", // This removes any default background
        }}
      >
        <Toolbar sx={{ justifyContent: "flex-end" }}>
          <IconButton
            edge="end"
            color="inherit"
            aria-label="menu"
            onClick={toggleDrawer(true)}
            sx={{
              // TODO: I should not even need to do this. It should handle in the theme.
              color: "text.secondary",
            }}
          >
            <ViewSidebarIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <ChatHistoryDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
      />

      <Container component="main" sx={{ flexGrow: 1, py: 3 }}>
        <Outlet />
      </Container>
      <Footer />
    </Box>
  );
};

export default CommonLayout;
