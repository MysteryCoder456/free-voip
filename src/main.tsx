import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";

const router = createBrowserRouter([
  {
    index: true,
    lazy: () => import("./routes/home"),
  },
  {
    path: "/get-started",
    lazy: () => import("./routes/get-started"),
  },
  {
    path: "/app",
    Component: () => <h1>Coming soon...</h1>,
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-right" expand richColors />
  </React.StrictMode>,
);
