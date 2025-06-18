import { trpc } from "@/services/trpc";
import {
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Box,
  CircularProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import { useState } from "react";

export default function ChatList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.chat.getAll.useInfiniteQuery(
      { limit: 10 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const utils = trpc.useUtils();
  const { mutate: createChat } = trpc.chat.create.useMutation({
    onSuccess: () => {
      utils.chat.getAll.invalidate();
    },
  });

  const { mutate: deleteChat } = trpc.chat.delete.useMutation({
    onSuccess: () => {
      utils.chat.getAll.invalidate();
      setDeleteDialogOpen(false);
    },
  });

  const { mutate: deleteAllChats, isPending: isDeletingAll } = trpc.chat.deleteAll.useMutation({
    onSuccess: (result) => {
      utils.chat.getAll.invalidate();
      setDeleteAllDialogOpen(false);
      // Optional: Show success message with count
      console.log(`Successfully deleted ${result.deletedCount} chats`);
    },
  });

  const { mutate: updateChat } = trpc.chat.update.useMutation({
    onSuccess: () => {
      utils.chat.getAll.invalidate();
      setEditingChatId(null);
      setEditingTitle("");
    },
  });

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);

  // Delete all state
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  // Edit state
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Counter for creating unique chat titles
  const [count, setCount] = useState(1);

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

  const handleDeleteAllClick = () => {
    setDeleteAllDialogOpen(true);
  };

  const handleDeleteAllConfirm = () => {
    deleteAllChats();
  };

  const handleDeleteAllCancel = () => {
    setDeleteAllDialogOpen(false);
  };

  const handleEditClick = (chatId: string, currentTitle: string) => {
    setEditingChatId(chatId);
    setEditingTitle(currentTitle);
  };

  const handleSaveEdit = () => {
    if (editingChatId && editingTitle.trim()) {
      updateChat({
        id: editingChatId,
        title: editingTitle.trim(),
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingChatId(null);
    setEditingTitle("");
  };

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditingTitle(event.target.value);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSaveEdit();
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  };

  // Flatten all chats from all pages
  const allChats = data?.pages.flatMap((page) => page.chats) ?? [];
  const totalCount = allChats.length;

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            createChat({
              title: `New Chat ${count}`,
              description: "New Chat Description",
            });
            setCount(count + 1);
          }}
        >
          Create Chat
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleDeleteAllClick}
          disabled={totalCount === 0 || isDeletingAll}
          startIcon={isDeletingAll ? <CircularProgress size={20} /> : null}
        >
          {isDeletingAll ? "Deleting..." : "Remove All"}
        </Button>
      </Box>

      <Typography variant="h6" sx={{ color: "text.primary", textAlign: "center" }}>
        {totalCount} chats
      </Typography>
      <Divider sx={{ mb: 2 }} />
      <List sx={{ width: "100%", maxWidth: 360, bgcolor: "background.paper" }}>
        {allChats.map((chat) => (
          <ListItem
            key={chat.id}
            secondaryAction={
              <Box sx={{ display: "flex", gap: 1 }}>
                {editingChatId === chat.id ? (
                  <>
                    <IconButton
                      edge="end"
                      aria-label="save"
                      onClick={handleSaveEdit}
                      sx={{ color: "success.main" }}
                      disabled={!editingTitle.trim()}
                    >
                      <SaveIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="cancel"
                      onClick={handleCancelEdit}
                      sx={{ color: "grey.500" }}
                    >
                      <CancelIcon />
                    </IconButton>
                  </>
                ) : (
                  <>
                    <IconButton
                      edge="end"
                      aria-label="edit"
                      onClick={() => handleEditClick(chat.id, chat.title)}
                      sx={{ color: "primary.main" }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={() => handleDeleteClick(chat.id)}
                      sx={{ color: "error.main" }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </>
                )}
              </Box>
            }
          >
            {editingChatId === chat.id ? (
              <TextField
                fullWidth
                value={editingTitle}
                onChange={handleTitleChange}
                onKeyDown={handleKeyPress}
                autoFocus
                variant="standard"
                placeholder="Enter chat title"
                sx={{ mr: 2 }}
              />
            ) : (
            <ListItemText primary={chat.title} secondary={chat.description} />
            )}
          </ListItem>
        ))}
        <Divider sx={{ mb: 2 }} />
      </List>

      {/* Load More Button */}
      {hasNextPage && (
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            startIcon={
              isFetchingNextPage ? <CircularProgress size={20} /> : null
            }
          >
            {isFetchingNextPage ? "Loading..." : "Load More"}
          </Button>
        </Box>
      )}

      {/* Single Chat Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">Delete Chat</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete this chat? This action cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
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

      {/* Delete All Chats Confirmation Dialog */}
      <Dialog
        open={deleteAllDialogOpen}
        onClose={handleDeleteAllCancel}
        aria-labelledby="delete-all-dialog-title"
        aria-describedby="delete-all-dialog-description"
      >
        <DialogTitle id="delete-all-dialog-title">Delete All Chats</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-all-dialog-description">
            Are you sure you want to delete ALL {totalCount} chats? This action cannot be
            undone and will permanently remove all your chat history.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteAllCancel} color="primary">
            Cancel
          </Button>
          <Button
            onClick={handleDeleteAllConfirm}
            color="error"
            variant="contained"
            disabled={isDeletingAll}
          >
            {isDeletingAll ? "Deleting..." : `Delete All ${totalCount} Chats`}
      </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
