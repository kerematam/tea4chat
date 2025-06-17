import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import { trpc } from "@/services/trpc";

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { data: profile, isLoading, error } = trpc.profile.useQuery();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        height="100vh"
        gap={2}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Checking admin permissions...
        </Typography>
      </Box>
    );
  }

  // Handle error or no profile data
  if (error || !profile) {
    return <Navigate to="/" replace />;
  }

  // Check if user is authenticated
  if (!profile.authenticated) {
    return <Navigate to="/" replace />;
  }

  // Check if user is admin
  if (!("isAdmin" in profile) || !profile.isAdmin) {
    return <Navigate to="/403" replace />;
  }

  // User is authenticated and is admin, render children
  return <>{children}</>;
};

export default AdminRoute; 