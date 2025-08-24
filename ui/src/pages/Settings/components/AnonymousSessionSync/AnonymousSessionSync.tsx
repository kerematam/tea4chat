import { useNotify } from "@/providers/NotificationProdiver/useNotify";
import { trpc } from "@/services/trpc";
import DismissIcon from "@mui/icons-material/Close";
import SyncIcon from "@mui/icons-material/Sync";
import {
  Alert,
  Box,
  Button,
  Chip,
  Skeleton,
  Typography,
} from "@mui/material";
import { useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const AnonymousSessionSync = () => {
  const [isDismissed, setIsDismissed] = useState(false);
  const { success, error } = useNotify();

  // Query for unsynced anonymous chats
  const { 
    data: unsyncedData, 
    isLoading, 
    error: queryError, 
    refetch 
  } = trpc.chat.getUnsyncedAnonymousChats.useQuery(undefined, {
    // Only fetch if component is not dismissed
    enabled: !isDismissed,
    // Refetch when window focuses to get latest data
    refetchOnWindowFocus: true,
  });

  // Get TRPC utils for invalidating cache
  const utils = trpc.useUtils();

  // Mutation for syncing chats
  const syncMutation = trpc.chat.syncAnonymousChats.useMutation({
    onSuccess: (data) => {
      success(data.message);
      setIsDismissed(true); // Hide after successful sync
      
      // Invalidate chat queries to refresh chat history everywhere
      utils.chat.invalidate();
      
      // Also refetch this query to update local state
      refetch();
    },
    onError: (err) => {
      error(err.message || 'Failed to sync anonymous chats');
    },
  });

  const handleSync = () => {
    // Sync all available chats
    syncMutation.mutate({});
  };

  const handleDismiss = () => {
    // Just hide the component - don't delete the data
    setIsDismissed(true);
  };

  // Don't render if dismissed, loading, error, or no data
  if (isDismissed) {
    return null;
  }

  if (isLoading) {
    return (
      <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
        <Skeleton variant="text" width="60%" height={24} />
        <Skeleton variant="text" width="80%" height={20} sx={{ mt: 1 }} />
        <Skeleton variant="rectangular" width="100%" height={80} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (queryError) {
    return (
      <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
        <Alert severity="error" sx={{ fontSize: "0.875rem" }}>
          Failed to check for anonymous chats: {queryError.message}
        </Alert>
      </Box>
    );
  }

  // Don't render if no unsynced data
  if (!unsyncedData || unsyncedData.stats.totalChats === 0) {
    return null;
  }

  const getRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    return dayjs(dateString).fromNow();
  };

  return (
    <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
      <Typography variant="subtitle2" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "warning.main" }} />
        Unsynced Data
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.4 }}>
        You have <strong>{unsyncedData.stats.totalChats} chat{unsyncedData.stats.totalChats !== 1 ? 's' : ''}</strong> with{' '}
        <strong>{unsyncedData.stats.totalMessages} message{unsyncedData.stats.totalMessages !== 1 ? 's' : ''}</strong> from a previous anonymous session.
      </Typography>
      
      <Box sx={{ mb: 1.5, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        <Chip 
          label={`${unsyncedData.stats.totalChats} chats`} 
          size="small" 
          variant="outlined" 
          color="primary" 
        />
        <Chip 
          label={`${unsyncedData.stats.totalMessages} messages`} 
          size="small" 
          variant="outlined" 
          color="secondary" 
        />
      </Box>

      {(unsyncedData.stats.oldestSession || unsyncedData.stats.newestSession) && (
        <Box sx={{ mb: 1.5 }}>
          {unsyncedData.stats.oldestSession && (
            <Typography variant="caption" color="text.secondary" display="block">
              First session: {getRelativeTime(unsyncedData.stats.oldestSession)}
            </Typography>
          )}
          {unsyncedData.stats.newestSession && (
            <Typography variant="caption" color="text.secondary" display="block">
              Last activity: {getRelativeTime(unsyncedData.stats.newestSession)}
            </Typography>
          )}
        </Box>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: "italic" }}>
        Would you like to sync these conversations to your account? This will preserve your chat history.
      </Typography>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          color="primary"
          fullWidth
          onClick={handleSync}
          disabled={syncMutation.isPending}
          startIcon={<SyncIcon />}
        >
          {syncMutation.isPending ? "Syncing..." : "Sync to Account"}
        </Button>
        <Button
          variant="text"
          size="small"
          color="error"
          fullWidth
          onClick={handleDismiss}
          startIcon={<DismissIcon />}
          disabled={syncMutation.isPending}
        >
          Dismiss
        </Button>
      </Box>
    </Box>
  );
};

export default AnonymousSessionSync; 