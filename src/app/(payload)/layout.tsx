import config from "@payload-config";
import "@payloadcms/next/css";
import "./admin-theme.css";
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
      {children}
    </RootLayout>
  );
}
