import { createLowlight, common } from "lowlight";

export const editorLowlight = createLowlight(common);

export const codeLanguageOptions = [
  { label: "Plain Text", value: "plaintext" },
  { label: "TypeScript", value: "typescript" },
  { label: "JavaScript", value: "javascript" },
  { label: "Python", value: "python" },
  { label: "JSON", value: "json" },
  { label: "Bash", value: "bash" },
  { label: "CSS", value: "css" },
  { label: "HTML", value: "xml" },
  { label: "Markdown", value: "markdown" },
  { label: "SQL", value: "sql" },
  { label: "YAML", value: "yaml" },
] as const;
