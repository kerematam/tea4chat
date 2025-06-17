import { useState, useRef, useEffect } from "react";
import {
  Box,
  Button,
  Modal,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  CircularProgress,
  Stack,
  Switch,
  FormControlLabel,
  Tooltip,
  IconButton,
  Divider,
} from "@mui/material";
import { trpc } from "@/services/trpc";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useNotify } from "@/providers/NotificationProdiver/useNotify";

interface ModelSelectorProps {
  chatId: string;
}

interface ModelCatalog {
  id: string;
  name: string;
  description?: string | null;
  provider: string;
  isEnabled: boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface ProviderGroup {
  provider: string;
  count: number;
  models: ModelCatalog[];
}

const ModelSelector = ({ chatId }: ModelSelectorProps) => {
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [tempSelection, setTempSelection] = useState<ModelInfo | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { error: notifyError } = useNotify();

  /* -------------------------- Queries & Mutations ------------------------- */
  const {
    data: modelData,
    isLoading,
    error,
  } = trpc.model.list.useQuery({
    includeSystem: true,
    includeCustom: true,
    onlyEnabled: true,
  });

  const utils = trpc.useUtils();
  const { data: selectionData, isLoading: selectionLoading } =
    trpc.model.getSelection.useQuery({ chatId });

  const selectedModel = tempSelection || selectionData?.selected || null;

  const updateDefault = trpc.model.updateDefault.useMutation({
    onSuccess: async () => {
      await utils.model.getSelection.invalidate();

      setModelModalOpen(false);
      setTempSelection(null);
    },
    onError: (err) => notifyError(err.message),
  });

  const updateChatModel = trpc.model.updateChatModel.useMutation({
    onSuccess: async () => {
      await utils.model.getSelection.invalidate();
      setModelModalOpen(false);
      setTempSelection(null);
    },
    onError: (err) => notifyError(err.message),
  });

  /* ------------------------------- Helpers -------------------------------- */
  const handleModelSelect = (model: ModelCatalog) => {
    setTempSelection({
      id: model.id,
      name: model.name,
      provider: model.provider,
    });
  };

  // Focus trap effect
  useEffect(() => {
    if (modelModalOpen && modalRef.current) {
      const timer = setTimeout(() => {
        modalRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [modelModalOpen]);

  const capitalizeProvider = (provider: string) => {
    if (provider === "openai") return "OpenAI";
    if (provider === "anthropic") return "Anthropic";
    return provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  /* ------------------------------- Actions -------------------------------- */
  const saveForChat = () => {
    updateChatModel.mutate({ chatId, modelId: tempSelection?.id || "" });
  };

  const saveAsDefault = () => {
    updateDefault.mutate({ modelId: tempSelection?.id || "" });
  };

  // unified save depending on switch
  const [applyToAll, setApplyToAll] = useState(false);

  const handleSave = () => {
    if (applyToAll) {
      // save as default
      saveAsDefault();
    } else {
      saveForChat();
    }
  };

  const isMutating = updateChatModel.isPending || updateDefault.isPending;

  /* -------------------------------- Render -------------------------------- */
  return (
    <>
      <Button
        variant="text"
        onClick={() => {
          setTempSelection(selectedModel);
          setModelModalOpen(true);
        }}
        sx={{
          mt: 2,
          textTransform: "none",
          alignSelf: "center",
          justifyContent: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            sx={{ mt: 0.5 }}
            label={capitalizeProvider(selectedModel?.provider || "")}
            size="small"
            color="primary"
          />
          {selectionLoading
            ? "Loading..."
            : selectedModel?.name || "No model selected"}
        </Box>
      </Button>

      <Modal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Box
          ref={modalRef}
          role="dialog"
          aria-labelledby="modal-title"
          tabIndex={-1}
          sx={{
            width: "90%",
            maxWidth: 800,
            bgcolor: "background.paper",
            borderRadius: 2,
            boxShadow: 24,
            p: 4,
            maxHeight: "80vh",
            overflow: "auto",
            outline: "none",
          }}
        >
          <Typography
            id="modal-title"
            variant="h5"
            sx={{ mb: 3, textAlign: "center" }}
          >
            Choose AI Model
          </Typography>

          {isLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {error && (
            <Typography color="error" sx={{ textAlign: "center", p: 2 }}>
              Failed to load models: {error.message}
            </Typography>
          )}

          {modelData &&
            modelData.providers.map((providerGroup: ProviderGroup) => (
              <Box key={providerGroup.provider} sx={{ mb: 4 }}>
                <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
                  {capitalizeProvider(providerGroup.provider)} Models
                </Typography>
                <Grid
                  container
                  spacing={2}
                  role="listbox"
                  aria-label={`${capitalizeProvider(
                    providerGroup.provider
                  )} Models`}
                >
                  {providerGroup.models.map((model) => (
                    <Grid item xs={12} sm={6} key={model.id}>
                      <Card
                        component="button"
                        role="option"
                        aria-selected={tempSelection?.id === model.id}
                        tabIndex={0}
                        sx={{
                          cursor: "pointer",
                          transition: "all 0.2s",
                          border: "1px solid",
                          borderColor: "divider",
                          boxShadow:
                            tempSelection?.id === model.id
                              ? "0 0 0 2px"
                              : "none",
                          color:
                            tempSelection?.id === model.id
                              ? "primary.main"
                              : "currentColor",
                          backgroundColor: "transparent",
                          textAlign: "left",
                          width: "100%",
                          p: 0,
                          "&:hover": { boxShadow: 4 },
                          "&:focus": {
                            outline: "2px solid",
                            outlineColor: "primary.main",
                            outlineOffset: "2px",
                          },
                        }}
                        onClick={() => handleModelSelect(model)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleModelSelect(model);
                          }
                        }}
                      >
                        <CardContent sx={{ width: "100%" }}>
                          <Typography variant="h6">{model.name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {model.description || "No description available"}
                          </Typography>
                          {!model.isEnabled && (
                            <Chip
                              label="Disabled"
                              size="small"
                              color="error"
                              sx={{ mt: 1 }}
                            />
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}

          {modelData && (
            <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ alignItems: "center" }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={applyToAll}
                      onChange={(e) => setApplyToAll(e.target.checked)}
                      color="primary"
                      disabled={isMutating}
                    />
                  }
                  label={
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                      Set as default
                      <Tooltip
                        placement="top"
                        componentsProps={{
                          tooltip: { sx: { maxWidth: 300, p: 2 } },
                        }}
                        title={
                          <Box>
                            <Typography variant="subtitle1" fontWeight={600}>
                              Current default:{" "}
                              {selectionData?.default?.name || "none"}
                            </Typography>
                            <Divider sx={{ my: 1 }} />
                            <Typography variant="body2">
                              Sets this as your default model for new chats and
                              any existing chats without a custom model.
                            </Typography>
                          </Box>
                        }
                      >
                        <IconButton size="small" sx={{ ml: 0.5 }}>
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                  labelPlacement="end"
                />

                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={isMutating}
                  endIcon={isMutating ? <CircularProgress size={16} /> : null}
                >
                  Save
                </Button>
              </Stack>
            </Box>
          )}
        </Box>
      </Modal>
    </>
  );
};

export default ModelSelector;
