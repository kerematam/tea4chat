import { CssBaseline } from "@mui/material";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  PersistQueryClientOptions,
  PersistQueryClientProvider,
} from "@tanstack/react-query-persist-client";
import { lazy, Suspense } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import AdminRoute from "./components/AdminRoute";
import CommonLayout from "./layouts/Common";
import { StreamTest } from "./pages/StreamTest/StreamTest";
import { StreamTestBullMQ } from "./pages/StreamTest/StreamTestBullMQ";
import { StreamTestEventSourced } from "./pages/StreamTest/StreamTestEventSourced";
import StreamTestMessage from "./pages/StreamTest/StreamTestMessage";
import StreamTestNative from "./pages/StreamTest/StreamTestNative";
import StreamTestSimple from "./pages/StreamTest/StreamTestSimple";
import { NotificationProvider } from "./providers/NotificationProdiver/NotificationProvider";
import { TrpcProvider } from "./providers/TrpcProvider";
import { persistOptions, queryClient } from "./services/queryClient";
import ThemeProvider from "./theme/ThemeProvider";

const Chat = lazy(() => import("./pages/Chat/Chat"));
const ChatList = lazy(() => import("./pages/ChatList/ChatList"));
const Settings = lazy(() => import("./pages/Settings/Settings"));
const AdminDashboard = lazy(() => import("./pages/Admin/AdminDashboard"));
const Forbidden = lazy(() => import("./pages/Error/Forbidden"));
const NotFound = lazy(() => import("./pages/Error/NotFound"));

const LoadingFallback = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
    }}
  >
    Loading...
  </div>
);

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions as unknown as PersistQueryClientOptions}
    >
      <TrpcProvider>
        <NotificationProvider>
          <ThemeProvider>
            <CssBaseline />
            <Router>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<CommonLayout />}>
                    <Route index element={<Chat />} />
                    <Route path="chat/:id?" element={<Chat />} />
                    <Route path="chat-list" element={<ChatList />} />
                    <Route path="settings" element={<Settings />} />

                    {/* Admin Routes */}
                    <Route
                      path="admin"
                      element={
                        <AdminRoute>
                          <AdminDashboard />
                        </AdminRoute>
                      }
                    />
                  </Route>
                  <Route path="stream-test" element={<StreamTest />} />
                  <Route
                    path="stream-test-event-sourced"
                    element={<StreamTestEventSourced />}
                  />
                  <Route
                    path="stream-test-bullmq"
                    element={<StreamTestBullMQ />}
                  />
                  <Route
                    path="stream-test-simple"
                    element={<StreamTestSimple />}
                  />
                  <Route
                    path="stream-test-native"
                    element={<StreamTestNative />}
                  />
                  <Route
                    path="stream-test-message"
                    element={<StreamTestMessage />}
                  />

                  <Route path="403" element={<Forbidden />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </Router>
            <ReactQueryDevtools
              initialIsOpen={false}
              buttonPosition="bottom-left"
              position="bottom"
            />
          </ThemeProvider>
        </NotificationProvider>
      </TrpcProvider>
    </PersistQueryClientProvider>
  );
}

export default App;
