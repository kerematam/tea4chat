import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// import { getAuth, GoogleAuthProvider } from "firebase/auth";

void import("./index.css");

if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === "true") {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const { worker } = await import("./mocks/browser");
  worker.start();
}

// const firebaseConfig = {
//   apiKey: "AIzaSyBP-W8XES0cAO8aX4tzPgno4a3GOoyRF0g",
//   authDomain: "chain-diver.firebaseapp.com",
//   projectId: "chain-diver",
//   storageBucket: "chain-diver.firebasestorage.app",
//   messagingSenderId: "164189114936",
//   appId: "1:164189114936:web:4775482ad37d4d1f5ccccd",
//   measurementId: "G-QKMZYQBNSB",
// };

// const app = initializeApp(firebaseConfig);
// export const auth = getAuth(app);
// export const googleProvider = new GoogleAuthProvider();

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
