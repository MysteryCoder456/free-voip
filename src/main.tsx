import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

const router = createBrowserRouter([
  {
    index: true,
    lazy: () => import("./routes/home"),
  },
  {
    path: "/get-started",
    lazy: () => import("./routes/get-started"),
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
