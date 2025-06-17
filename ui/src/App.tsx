import { CssBaseline } from "@mui/material";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import CommonLayout from "./layouts/Common";
import ThemeProvider from "./theme/ThemeProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./services/queryClient";
import { TrpcProvider } from "./providers/TrpcProvider";
import { NotificationProvider } from "./providers/NotificationProdiver/NotificationProvider";
import AdminRoute from "./components/AdminRoute";

// Lazy load components
const Chat = lazy(() => import("./pages/Chat/Chat"));
const Home = lazy(() => import("./pages/Home/Home"));
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
    <QueryClientProvider client={queryClient}>
      <TrpcProvider>
        <NotificationProvider>
          <ThemeProvider>
            <CssBaseline />
            <Router>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<CommonLayout />}>
                    <Route index element={<Home />} />
                    <Route path="chat/:id" element={<Chat />} />
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
                    
                    {/* <Route path="/login" element={<Login />} /> */}
                  </Route>
                  
                  {/* Error Pages - Outside CommonLayout for full-page display */}
                  <Route path="403" element={<Forbidden />} />
                  
                  {/* Catch-all route for 404 - Must be last */}
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
    </QueryClientProvider>
  );
}

export default App;
