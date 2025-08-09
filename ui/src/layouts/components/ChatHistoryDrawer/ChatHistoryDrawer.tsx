import { useNotify } from "@/providers/NotificationProdiver/useNotify";
import UserInfoSection from "@/services/auth/UserInfoSection";
import { trpc } from "@/services/trpc";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditIcon from "@mui/icons-material/Edit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useNavigate } from "react-router-dom";

dayjs.extend(relativeTime);

const LoadingSkeleton = () => (
  <List>
    {[1, 2, 3, 4, 5].map((item) => (
      <ListItemButton key={item} disabled>
        <Skeleton variant="rectangular" width="100%">
          <ListItemText primary="Loading..." />
        </Skeleton>
      </ListItemButton>
    ))}
  </List>
);

const EmptyState = () => (
  <Box
    sx={{
      mt: 4,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      height: "100%",
      p: 3,
      textAlign: "center",
      color: "text.secondary",
    }}
  >
    <ChatBubbleOutlineIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
    <Typography variant="h6" gutterBottom>
      No Chat History
    </Typography>
    <Typography variant="body2">
      Your chat conversations will appear here
    </Typography>
  </Box>
);

const ErrorState = () => (
  <Box
    sx={{
      mt: 4,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      p: 3,
      textAlign: "center",
      color: "text.secondary",
    }}
  >
    <ErrorOutlineIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
    <Typography variant="h6">Error</Typography>
    <Typography variant="body2">
      An error occurred while fetching your chat history
    </Typography>
  </Box>
);

const ChatHistoryDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { error } = useNotify();
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [chatToEdit, setChatToEdit] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Replace regular query with infinite query for pagination
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.chat.getAll.useInfiniteQuery(
    { limit: 10 }, // Smaller limit for better UX
    {
      enabled: open, // Only fetch when drawer is open
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  const utils = trpc.useUtils();
  const { mutate: deleteChat } = trpc.chat.delete.useMutation({
    onSuccess: () => {
      utils.chat.getAll.invalidate();
      setDeleteDialogOpen(false);
      setChatToDelete(null);
    },
    onError: (err) => {
      error(err.message);
    },
  });

  const { mutate: updateChat } = trpc.chat.update.useMutation({
    onSuccess: () => {
      utils.chat.getAll.invalidate();
      setEditDialogOpen(false);
      setChatToEdit(null);
      setEditingTitle("");
    },
    onError: (err) => {
      error(err.message);
    },
  });

  const navigate = useNavigate();

  // Flatten all chats from all pages
  const allChats = data?.pages.flatMap((page) => page.chats) ?? [];

  // Use react-intersection-observer hook
  const { ref: sentinelRef, inView } = useInView({
    threshold: 0,
    rootMargin: "100px",
  });

  // Trigger fetchNextPage when sentinel comes into view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Delete handlers
  const handleDeleteClick = (chatId: string) => {
    setChatToDelete(chatId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (chatToDelete) {
      deleteChat({ id: chatToDelete });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setChatToDelete(null);
  };

  // Edit handlers
  const handleEditClick = (chatId: string, currentTitle: string) => {
    setChatToEdit(chatId);
    setEditingTitle(currentTitle);
    setEditDialogOpen(true);
  };

  const handleEditConfirm = () => {
    if (chatToEdit && editingTitle.trim()) {
      updateChat({
        id: chatToEdit,
        title: editingTitle.trim(),
      });
    }
  };

  const handleEditCancel = () => {
    setEditDialogOpen(false);
    setChatToEdit(null);
    setEditingTitle("");
  };

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditingTitle(event.target.value);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleEditConfirm();
    } else if (event.key === "Escape") {
      handleEditCancel();
    }
  };

  let content = null;
  if (isLoading) {
    content = <LoadingSkeleton />;
  } else if (isError) {
    content = <ErrorState />;
  } else if (allChats.length === 0) {
    content = <EmptyState />;
  } else {
    content = (
      <Box
        sx={{
          flex: 1,
          width: 300,
          overflowY: "auto",
          "&::-webkit-scrollbar": {
            width: "6px",
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "action.hover",
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "divider",
            borderRadius: "3px",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            backgroundColor: "text.secondary",
          },
        }}
      >
        <List>
          {allChats.map((item) => (
            <ListItem
              sx={{
                "&:hover .action-buttons, &:focus-within .action-buttons": {
                  visibility: "visible",
                },
                width: "100%",
              }}
              key={item.id}
              secondaryAction={
                <Box
                  className="action-buttons"
                  sx={{
                    display: "flex",
                    gap: 1,
                    alignItems: "center",
                    visibility: "hidden",
                  }}
                >
                  <Tooltip title="edit" placement="bottom">
                    <IconButton
                      edge="end"
                      aria-label="edit"
                      onClick={() => handleEditClick(item.id, item.title)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="delete" placement="bottom">
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => handleDeleteClick(item.id)}
                    >
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              }
              disablePadding
            >
              <ListItemButton
                role={undefined}
                onClick={() => {
                  navigate(`/chat/${item.id}`, { viewTransition: true });
                }}
                dense
              >
                <ListItemText
                  id={item.id}
                  primary={item.title}
                  secondary={dayjs(item.createdAt).fromNow()}
                  sx={{
                    "& .MuiListItemText-primary": {
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 200,
                      lineHeight: 1.2,
                    },
                    "& .MuiListItemText-secondary": {
                      fontSize: "0.8rem",
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
          {hasNextPage && (
            <Box
              ref={sentinelRef}
              sx={{
                height: "1px",
                width: "100%",
                visibility: "hidden",
              }}
            />
          )}

          {/* Loading indicator for infinite scroll */}
          {isFetchingNextPage && (
            <ListItem sx={{ justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} />
            </ListItem>
          )}
        </List>
      </Box>
    );
  }

  return (
    <>
      <Drawer anchor="right" open={open} onClose={onClose}>
        {/* <Box
          sx={{
            p: 2,
            pb: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            width: 300,
            maxWidth: 300,
          }}
        >
          <HistoryOutlinedIcon />
          <Typography variant="h6">History</Typography>
        </Box>
         */}
        {/* New Chat Button */}
        <Box sx={{ px: 2, pt: 1, width: "100%" }}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<AddIcon />}
            onClick={() => {
              navigate("/chat");
              onClose(); // Close drawer after navigation
            }}
            sx={{ mb: 1 }}
          >
            New Chat
          </Button>
        </Box>

        <Box sx={{ px: 2, width: "100%" }}>
          <Divider />
        </Box>
        {content}
        <UserInfoSection />
      </Drawer>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete Chat</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete this chat from your history? This
            action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ gap: 1, p: 2 }}>
          <Button
            onClick={handleDeleteCancel}
            variant="contained"
            color="primary"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={editDialogOpen}
        onClose={handleEditCancel}
        aria-labelledby="edit-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="edit-dialog-title">Edit Chat Title</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Chat Title"
            fullWidth
            variant="outlined"
            value={editingTitle}
            onChange={handleTitleChange}
            onKeyDown={handleKeyPress}
            placeholder="Enter chat title"
            sx={{ mt: 2 }}
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditCancel} color="primary">
            Cancel
          </Button>
          <Button
            onClick={handleEditConfirm}
            color="primary"
            variant="contained"
            disabled={!editingTitle.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ChatHistoryDrawer;
