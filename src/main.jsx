import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { LanguageProvider } from "./i18n/LanguageContext.jsx";
import { DataProvider } from "./data/store.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DataProvider>
      <LanguageProvider defaultLang="en">
        <App />
      </LanguageProvider>
    </DataProvider>
  </React.StrictMode>
);
