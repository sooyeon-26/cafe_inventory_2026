import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import "./styles.css";
import "./workspace.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: {
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: true,
    refetchInterval: 60_000,
  }, mutations: { retry: false } },
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
