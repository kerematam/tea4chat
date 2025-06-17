import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// CSP Plugin for Development
// function cspPlugin() {
//   return {
//     name: 'csp-plugin',
//     configureServer(server) {
//       server.middlewares.use((req, res, next) => {
//         // Simplified CSP for development
//         const csp = [
//           "default-src 'self'",
//           "script-src 'self' 'unsafe-inline'",
//           "style-src 'self' 'unsafe-inline'",
//           "connect-src 'self' ws: wss:",
//           "img-src 'self' data:",
//           "font-src 'self'",
//           "object-src 'none'",
//           "base-uri 'self'"
//         ].join('; ');

//         res.setHeader('Content-Security-Policy', csp);
//         next();
//       });
//     },
//   };
// }

export default defineConfig(() => {
  return {
    resolve: {
      alias: {
        "@server": path.resolve(__dirname, "../server/src"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      react(),
      // cspPlugin(),
    ],

    preview: {
      port: 5173,
    },
    server: {
      proxy: {
        // better auth using this proxy
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
          secure: false,
        },
        "/trpc": {
          target: "http://localhost:3000",
          changeOrigin: true,
          secure: false,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('origin', 'http://localhost:5173');
            });
          },
        },
      },
    },
  };
});
