// use defineConfig() for easy access to types
import { defineConfig } from "sahne-js";

export default defineConfig({
  initialUrl: "https://chaindiver.com",
  interceptor: [
    {
      match: ({ href }) => href.startsWith("https://chaindiver.com"),
      proxy: "http://localhost:5173",
      ignore: "https://chaindiver.com/api/**",
    },
  ],
});
