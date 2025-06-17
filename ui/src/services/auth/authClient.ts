import { createAuthClient } from "better-auth/react";


export const authClient = createAuthClient({
  // baseURL: "http://localhost:3000/api/auth",
  // INFO: come back here
  baseURL: window.location.origin + "/api/auth",
  // baseURL: "http://localhost:3000/api/auth",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
  },
  // TODO: add passkey plugin
  // plugins: [passkeyClient()],
});