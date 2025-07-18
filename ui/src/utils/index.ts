const getCookie = (name: string) => {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
};

// TODO: use it from server: import { isUserAbortError } from "../../../server/src/lib/errors";
// currenty it fails on docker build since server folder is not copied to ui folder

// Helper function to check if an error is a user-initiated abort
const isUserAbortError = (error: unknown): boolean => {
  // Check error code
  if (error && typeof error === 'object') {
    if ('code' in error && error.code === 'CLIENT_CLOSED_REQUEST') {
      return true;
    }
    
    // Check error message for abort-related keywords
    if ('message' in error) {
      const message = String(error.message);
      return message.includes('CLIENT_CLOSED_REQUEST') || 
             message.includes('Stream was aborted') ||
             message.includes('Client disconnected') ||
             message.includes('Stream was aborted before starting') ||
             message.includes('Stream was aborted') ||
             message.includes('Client disconnected');
    }
  }
  
  return false;
};

export { getCookie, isUserAbortError };
