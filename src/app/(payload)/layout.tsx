import "../styles/sunny-chrome.css";
import "../styles/sunny-typography.css";
import "../styles/sunny-base.css";
import "../styles/sunny-ui.css";
import config from "@payload-config";
import "@payloadcms/next/css";
import "../styles/sunny-tokens.css";
import "../styles/sunny-palettes.css";
import "./admin-theme.css";
import "../styles/sunny-payload-bridge.css";
import "../styles/sunny-prose.css";
import "../styles/sunny-markdown.css";
import "../styles/sunny-admin-shell.css";
import "../styles/sunny-admin-unified.css";
import { EditorStyles } from "@/components/editor/EditorStyles";
import { RootLayout, handleServerFunctions } from "@payloadcms/next/layouts";
import type { ServerFunctionClient } from "payload";

import { importMap } from "./admin/importMap.js";

export { metadata } from "@payloadcms/next/layouts";

const serverFunction: ServerFunctionClient = async (args) => {
  "use server";

  return handleServerFunctions({ ...args, config, importMap });
};

export default function PayloadLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={serverFunction}
    >
      <EditorStyles />
      {children}
    </RootLayout>
  );
}
