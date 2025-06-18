import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  CircularProgress,
  Chip,
  IconButton,
} from "@mui/material";
import KeyIcon from "@mui/icons-material/Key";
import SaveIcon from "@mui/icons-material/Save";
import { Formik, Form, Field, FieldProps } from "formik";
import * as Yup from "yup";
import { trpc } from "@/services/trpc";
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useNotify } from "@/providers/NotificationProdiver/useNotify";
interface FormValues {
  openaiApiKey: string;
  anthropicApiKey: string;
}

// Validation schema
const validationSchema = Yup.object({
  openaiApiKey: Yup.string()
    .test('format', 'OpenAI API key must start with "sk-"', function(value: string | undefined) {
      if (!value || value === '') return true; // Allow empty
      return value.startsWith('sk-');
    }),
  anthropicApiKey: Yup.string()
    .test('format', 'Anthropic API key must start with "sk-ant-"', function(value: string | undefined) {
      if (!value || value === '') return true; // Allow empty
      return value.startsWith('sk-ant-');
    }),
});

const ApiKeysCard = () => {
  const { data: settings, refetch } = trpc.settings.get.useQuery();
  console.log(settings);
  const notify = useNotify();
  
  const updateApiKeysMutation = trpc.settings.updateApiKeys.useMutation({
    onSuccess: () => {
      notify.success("API keys updated successfully!");
    },
    onError: (error) => {
      notify.error(`Failed to update API keys: ${error.message}`);
    },
  });

  const deleteApiKeysMutation = trpc.settings.deleteApiKeys.useMutation({
    onSuccess: () => {
      notify.success("API key deleted successfully!");
      refetch(); // Refetch settings after successful deletion
    },
    onError: (error) => {
      notify.error(`Failed to delete API key: ${error.message}`);
    },
  });

  const handleSubmit = async (values: FormValues, { resetForm }: { resetForm: () => void }) => {
    const updateData: { openaiApiKey?: string; anthropicApiKey?: string } = {};
    
    // Only include fields that have values
    if (values.openaiApiKey && values.openaiApiKey.trim()) {
      updateData.openaiApiKey = values.openaiApiKey.trim();
    }
    
    if (values.anthropicApiKey && values.anthropicApiKey.trim()) {
      updateData.anthropicApiKey = values.anthropicApiKey.trim();
    }

    await updateApiKeysMutation.mutateAsync(updateData);
    
    // Reset form to untouched state and refetch data
    resetForm();
    refetch();
  };

  const handleDeleteKey = (keyType: 'openai' | 'anthropic') => {
    const deleteData = {
      deleteOpenai: keyType === 'openai',
      deleteAnthropic: keyType === 'anthropic',
    };
    
    deleteApiKeysMutation.mutate(deleteData);
  };

  if (!settings) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

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

        <Formik
          initialValues={{
            openaiApiKey: '',
            anthropicApiKey: '',
          }}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ errors, isSubmitting, dirty }) => (
            <Form>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {/* OpenAI API Key Section */}
                {settings.hasOpenaiApiKey ? (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, bgcolor: "success.dark", borderRadius: 1, color: "success.contrastText" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip 
                        label="OpenAI API Key" 
                        color="success" 
                        variant="filled"
                        size="small"
                      />
                      <Typography variant="body2" color="inherit">
                        ✓ Configured
                      </Typography>
                    </Box>
                    <IconButton
                      color="inherit"
                      onClick={() => handleDeleteKey('openai')}
                      disabled={deleteApiKeysMutation.isPending}
                      title="Delete OpenAI API Key"
                      sx={{ p: 1 }}
                    >
                      <DeleteOutlineOutlinedIcon fontSize="medium" />
                    </IconButton>
                  </Box>
                ) : (
                  <Field name="openaiApiKey">
                    {({ field }: FieldProps<string>) => (
                      <TextField
                        {...field}
                        label="OpenAI API Key"
                        type="password"
                        fullWidth
                        placeholder="sk-..."
                        helperText={errors.openaiApiKey || "Enter your OpenAI API key for GPT models"}
                        error={!!errors.openaiApiKey}
                      />
                    )}
                  </Field>
                )}
                
                {/* Anthropic API Key Section */}
                {settings.hasAnthropicApiKey ? (
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 2, bgcolor: "success.dark", borderRadius: 1, color: "white" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip 
                        label="Anthropic API Key" 
                        color="success" 
                        variant="filled"
                        size="small"
                      />
                      <Typography variant="body2" color="inherit">
                        ✓ Configured
                      </Typography>
                    </Box>
                    <IconButton
                      color="inherit"
                      onClick={() => handleDeleteKey('anthropic')}
                      disabled={deleteApiKeysMutation.isPending}
                      title="Delete Anthropic API Key"
                      sx={{ p: 1 }}
                    >
                      <DeleteOutlineOutlinedIcon fontSize="medium" />
                    </IconButton>
                  </Box>
                ) : (
                  <Field name="anthropicApiKey">
                    {({ field }: FieldProps<string>) => (
                      <TextField
                        {...field}
                        label="Anthropic API Key"
                        type="password"
                        fullWidth
                        placeholder="sk-ant-..."
                        helperText={errors.anthropicApiKey || "Enter your Anthropic API key for Claude models"}
                        error={!!errors.anthropicApiKey}
                      />
                    )}
                  </Field>
                )}

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {(!settings.hasOpenaiApiKey || !settings.hasAnthropicApiKey) && (
                    <Button
                      type="submit"
                      variant="contained"
                      startIcon={isSubmitting ? <CircularProgress size={16} /> : <SaveIcon />}
                      disabled={!dirty || isSubmitting || !!errors.openaiApiKey || !!errors.anthropicApiKey}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      {isSubmitting ? "Saving..." : "Save API Keys"}
                    </Button>
                  )}
                </Box>
              </Box>
            </Form>
          )}
        </Formik>
      </CardContent>
    </Card>
  );
};

export default ApiKeysCard;
