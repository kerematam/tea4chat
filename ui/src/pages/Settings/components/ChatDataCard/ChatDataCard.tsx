import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  LinearProgress,
  TextField,
  Divider,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import ImportExportIcon from "@mui/icons-material/ImportExport";
import CodeIcon from "@mui/icons-material/Code";
import { useState, useRef } from "react";
import { useNotify } from "@/providers/NotificationProdiver/useNotify";
import { trpc } from "@/services/trpc";

const ChatDataCard = () => {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [processingJson, setProcessingJson] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error, success } = useNotify();
  const utils = trpc.useUtils();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.json')) {
      error('Only JSON files are allowed for import');
      return;
    }

    setImporting(true);
    try {
      const fileContent = await file.text();
      
      // Validate JSON format
      try {
        JSON.parse(fileContent);
      } catch {
        error('Invalid JSON file format');
        return;
      }

      // Submit to the server using the same import endpoint
      await importChatsMutation.mutateAsync({
        jsonData: fileContent,
      });
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      // Error handling is done in the mutation's onError
      console.error('File import error:', err);
    } finally {
      setImporting(false);
    }
  };

  const exportChatsMutation = trpc.chat.export.useQuery(undefined, {
    enabled: false, // Don't auto-fetch, only fetch when called manually
  });

  const handleExportChats = async () => {
    setExporting(true);
    try {
      // Fetch export data from the server
      const exportData = await exportChatsMutation.refetch();
      
      if (!exportData.data) {
        throw new Error('No export data received');
      }

      // Create and download file
      const blob = new Blob([JSON.stringify(exportData.data, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tea4chat-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      success(`Exported ${exportData.data.stats.totalChats} chats with ${exportData.data.stats.totalMessages} messages!`);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      error('Failed to export chats');
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const importChatsMutation = trpc.chat.import.useMutation({
    onSuccess: (data) => {
      setImportSuccess(true);
      success(data.message);
      setTimeout(() => setImportSuccess(false), 3000);
      
      // Log detailed results for debugging
      console.log('Import Results:', data.results);
      if (data.results.errors.length > 0) {
        console.warn('Import Errors:', data.results.errors);
      }
      
      // Clear the textarea
      setJsonInput('');
      
      // Invalidate chat queries to refresh chat history
      utils.chat.invalidate();
    },
    onError: (err) => {
      error(err.message || 'Failed to import chats');
      console.error('Import error:', err);
    },
  });

  const handleJsonSubmit = async () => {
    if (!jsonInput.trim()) {
      error('Please enter JSON data to import');
      return;
    }

    setProcessingJson(true);
    try {
      // Validate JSON format client-side first
      try {
        JSON.parse(jsonInput);
      } catch {
        error('Invalid JSON format');
        return;
      }

      // Submit to the server
      await importChatsMutation.mutateAsync({
        jsonData: jsonInput,
      });
    } catch (err) {
      // Error handling is done in the mutation's onError
      console.error('JSON processing error:', err);
    } finally {
      setProcessingJson(false);
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
            <ImportExportIcon />
            Chat Data Management
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Import and export your chat history. Only JSON files are supported for import.
          </Typography>

          {importSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Chats imported successfully!
            </Alert>
          )}

          {exportSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Chats exported successfully!
            </Alert>
          )}

          {importing && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Importing chats...
              </Typography>
              <LinearProgress />
            </Box>
          )}

          {exporting && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Exporting chats...
              </Typography>
              <LinearProgress />
            </Box>
          )}

          {processingJson && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Processing JSON data...
              </Typography>
              <LinearProgress />
            </Box>
          )}

          {/* Temporary JSON Testing Section */}
          {/* <Box sx={{ mb: 3, p: 2, border: 1, borderColor: "warning.main", borderRadius: 1, backgroundColor: "rgba(255, 193, 7, 0.1)" }}>
            <Typography variant="subtitle2" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1, color: "warning.dark" }}>
              <CodeIcon />
              Development: JSON Testing
            </Typography>
            
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
              Temporary testing area - paste JSON data directly for testing import functionality
            </Typography>

            <TextField
              multiline
              rows={8}
              fullWidth
              placeholder='Paste your JSON data here for testing...\n\nExample:\n{\n  "chats": [\n    {\n      "id": "123",\n      "title": "Test Chat",\n      "messages": [...]\n    }\n  ]\n}'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              sx={{ mb: 2, fontFamily: "monospace" }}
              variant="outlined"
            />

            <Button
              variant="contained"
              color="warning"
              startIcon={<CodeIcon />}
              onClick={handleJsonSubmit}
              disabled={importing || exporting || processingJson || !jsonInput.trim()}
              fullWidth
            >
              {processingJson ? "Processing JSON..." : "Test JSON Import"}
            </Button>
          </Box> */}

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />

            {/* Import Button */}
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={handleUploadClick}
              disabled={importing || exporting}
              fullWidth
            >
              {importing ? "Importing..." : "Import Chats (JSON)"}
            </Button>

            {/* Export Button */}
            <Button
              variant="contained"
              startIcon={<CloudDownloadIcon />}
              onClick={handleExportChats}
              disabled={importing || exporting}
              fullWidth
            >
              {exporting ? "Exporting..." : "Export Chats"}
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
            <strong>Note:</strong> Import will merge with existing chats. Export includes all your chat history.
          </Typography>
        </CardContent>
      </Card>
  );
};

export default ChatDataCard; 