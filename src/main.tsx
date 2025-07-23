import { Loader } from "lucide-react";
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, useNavigate } from "react-router";
import { Toaster } from "@/components/ui/sonner";

const router = createBrowserRouter([
  {
    index: true,
    lazy: () => import("./routes/"),
  },
  {
    path: "get-started",
    lazy: () => import("./routes/get-started"),
  },
  {
    path: "app",
    children: [
      {
        index: true,
        Component: () => {
          const navigate = useNavigate();
          useEffect(() => {
            navigate("contacts-list");
          }, [navigate]);
          return <Loader className="animate-spin" />;
        },
      },
      {
        lazy: () => import("./routes/app/"),
        children: [
          {
            path: "my-card",
            lazy: () => import("./routes/app/my-card"),
          },
          {
            path: "contacts-list",
            lazy: () => import("./routes/app/contacts-list"),
          },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-right" expand richColors />
  </React.StrictMode>,
);
