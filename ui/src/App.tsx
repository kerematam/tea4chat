import { CssBaseline } from "@mui/material";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import CommonLayout from "./layouts/Common";
import ThemeProvider from "./theme/ThemeProvider";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient, persister } from "./services/queryClient";
import { TrpcProvider } from "./providers/TrpcProvider";
import { NotificationProvider } from "./providers/NotificationProdiver/NotificationProvider";
import AdminRoute from "./components/AdminRoute";
import { StreamTest } from "./pages/StreamTest/StreamTest";
import { StreamTestEventSourced } from "./pages/StreamTest/StreamTestEventSourced";

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
      persistOptions={{
        persister,
        maxAge: 86400000, // 24 hours
        // INFO: leaving here for debugging
        // dehydrateOptions: {
        //   shouldDehydrateQuery: (query) => {
        //     const shouldPersist = query.state.status === 'success';
        //     return shouldPersist;
        //   },
        // },
      }}
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
