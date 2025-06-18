import { Box, Divider, IconButton, CircularProgress } from "@mui/material";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import { ChatTextField } from "../ChatTextField/ChatTextField";

const ChatCreateForm = ({
  question,
  setQuestion,
  isLoading,
  handleSubmit,
}: {
  question: string;
  setQuestion: (value: string) => void;
  isLoading: boolean;
  handleSubmit: (e: React.SyntheticEvent) => void;
}) => {
  return (
    <Box
      sx={{
        p: 1,
        display: "flex",
        alignItems: "center",
        width: "100%",
        border: (theme) => 
          theme.palette.mode === "light" ? "2px solid" : "none",
        borderColor: (theme) => 
          theme.palette.mode === "light" ? "divider" : "transparent",
        background: (theme) => theme.palette.background.paper,
        borderRadius: "4px",
      }}
      component="form"
      onSubmit={handleSubmit}
    >
      <ChatTextField
        onChange={setQuestion}
        value={question}
        disabled={isLoading}
        placeholder="Type your message here..."
      />
      <Divider sx={{ height: 28, m: 0.5 }} orientation="vertical" />
      <IconButton
        type="submit"
        color="primary"
        disabled={isLoading}
        sx={{ p: "10px", "&:focus": { color: "text.primary" } }}
        aria-label="directions"
      >
        {isLoading ? (
          <CircularProgress size={20} color="inherit" />
        ) : (
          <ArrowForwardIosIcon sx={{ fontSize: 20 }} />
        )}
      </IconButton>
    </Box>
  );
};

export default ChatCreateForm;
