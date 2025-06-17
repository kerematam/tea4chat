import { InputBase } from "@mui/material";

interface ChatTextFieldProps {
  onChange: (value: string) => void;
  value: string;
  disabled?: boolean;
  placeholder?: string;
}

const label = "Type your message here...";

export const ChatTextField: React.FC<ChatTextFieldProps> = ({
  onChange,
  value,
  disabled,
  placeholder,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent default to avoid new line
      const form = e.currentTarget.closest("form");
      if (form) {
        form.requestSubmit(); // This triggers the form submission
      }
    }
  };

  return (
    <InputBase
      multiline
      sx={{ ml: 1, flex: 1 }}
      value={value}
      disabled={disabled}
      inputProps={{ "aria-label": label || placeholder }}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder || label}
      aria-label={label || placeholder}
    />
  );
};
