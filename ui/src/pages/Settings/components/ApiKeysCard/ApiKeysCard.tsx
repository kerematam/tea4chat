import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
} from "@mui/material";
import KeyIcon from "@mui/icons-material/Key";
import SaveIcon from "@mui/icons-material/Save";
import { useState } from "react";

const ApiKeysCard = () => {
  // API Keys state
  const [apiKeys, setApiKeys] = useState({
    openai: "",
    anthropic: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveApiKeys = async () => {
    setSaving(true);
    try {
      // TODO: Implement API key saving logic
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save API keys:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
        <CardContent>
          <Typography
            variant="h6"
            gutterBottom
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <KeyIcon />
            API Keys Management
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add your API keys to use different AI models. Keys are stored securely and never displayed.
          </Typography>

          {saveSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              API keys saved successfully!
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="OpenAI API Key"
              type="password"
              fullWidth
              value={apiKeys.openai}
              onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
              placeholder="sk-..."
              helperText="Enter your OpenAI API key for GPT models"
            />
            
            <TextField
              label="Anthropic API Key"
              type="password"
              fullWidth
              value={apiKeys.anthropic}
              onChange={(e) => setApiKeys(prev => ({ ...prev, anthropic: e.target.value }))}
              placeholder="sk-ant-..."
              helperText="Enter your Anthropic API key for Claude models"
            />

            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveApiKeys}
              disabled={saving || (!apiKeys.openai.trim() && !apiKeys.anthropic.trim())}
              sx={{ alignSelf: "flex-start" }}
            >
              {saving ? "Saving..." : "Save API Keys"}
            </Button>
          </Box>
        </CardContent>
      </Card>
  );
};

export default ApiKeysCard; 