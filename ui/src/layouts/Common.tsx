import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import { AppBar, Box, Container, IconButton, Toolbar } from "@mui/material";
import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import ChatHistoryDrawer from "./components/ChatHistoryDrawer/ChatHistoryDrawer";
import Footer from "./components/Footer/Footer";

const CommonLayout = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer =
    (open: boolean) => (event: React.KeyboardEvent | React.MouseEvent) => {
      if (
        event.type === "keydown" &&
        "key" in event &&
        ["Tab", "Shift"].includes(event.key)
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
        enableColorOnDark
        elevation={0}
        sx={{
          backgroundColor: (theme) => theme.palette.background.default,
          border: "transparent",
          boxShadow: "none",
        }}
      >
        <Toolbar sx={{ justifyContent: "flex-end" }}>
          <IconButton
            edge="end"
            color="inherit"
            aria-label="menu"
            onClick={toggleDrawer(true)}
            sx={{
              color: "primary.main",
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
