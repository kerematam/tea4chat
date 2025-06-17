import { Box, Typography, Paper, Grid, Card, CardContent } from "@mui/material";
import { trpc } from "@/services/trpc";

const AdminDashboard = () => {
  const { data: profile } = trpc.profile.useQuery();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Admin Dashboard
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Welcome, {profile?.user?.name || profile?.user?.email}
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                User Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Manage users, permissions, and roles
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                System Settings
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Configure application settings and preferences
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" gutterBottom>
                Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary">
                View system usage and performance metrics
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Admin Information
            </Typography>
            <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace' }}>
              {JSON.stringify(profile, null, 2)}
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminDashboard; 