import { useNavigate } from "react-router-dom";
import { useChatMessages } from "../../hooks/useChatMessages/useChatMessages";
import Home from "./Home";

const HomePage = () => {
  const navigate = useNavigate();

  // Use the chat messages hook to get send message functionality
  const { sendMessage, isSending } = useChatMessages({
    chatId: undefined, // No chat ID for new chat
    onChatCreated: ({ chatId }: { chatId: string }) => {
      // Navigate to the new chat when created
      navigate(`/chat/${chatId}`);
    },
  });

  return (
    <Home 
      onSendMessage={sendMessage} 
      isSending={isSending} 
    />
  );
};

export default HomePage;