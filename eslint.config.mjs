import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/* Strict rules applied project-wide (was previously agent-only). */
const strictRules = {
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      disallowTypeAnnotations: false,
      fixStyle: "separate-type-imports",
      prefer: "type-imports",
    },
  ],
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-floating-promises": "warn",
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-console": ["warn", { allow: ["warn", "error"] }],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: strictRules,
  },
  {
    files: ["src/lib/agent/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".agent-test-dist/**",
    ".claude/worktrees/**",
    ".worktrees/**",
    "coverage/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
