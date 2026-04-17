import config from "@payload-config";
import { RootLayout, handleServerFunctions } from "@payloadcms/next/layouts";

import { importMap } from "./admin/importMap.js";

export { metadata } from "@payloadcms/next/layouts";

export default function PayloadLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootLayout
      config={config}
      importMap={importMap}
      serverFunction={(args) => handleServerFunctions({ ...args, config, importMap })}
    >
      {children}
    </RootLayout>
  );
}
