import React from "react";
import ReactDOM from "react-dom/client";
import { ProjectLibraryPage } from "./pages/ProjectLibraryPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ProjectLibraryPage />
  </React.StrictMode>
);
