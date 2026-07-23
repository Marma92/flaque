import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      ".e2e/**",
      "playwright-report/**",
      "test-results/**",
      "data/**",
      "**/*.config.js",
      "**/*.config.cjs",
      "**/*.config.mjs",
      "**/*.config.ts",
      "frontend/scripts/**",
      "frontend/public/**",
      "backend/python-services/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TypeScript, not ESLint, resolves identifiers and ambient/library globals,
    // so `no-undef` only produces false positives on typed code.
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }
      ]
    }
  },
  {
    // Backend, shared and e2e run under Node.
    files: ["backend/**/*.ts", "shared/**/*.ts", "e2e/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  {
    // Frontend runs in the browser and uses React.
    files: ["frontend/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    languageOptions: {
      globals: { ...globals.browser }
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  },
  {
    // Tests and test helpers exercise internals, mock loosely, and use require().
    files: ["**/*.test.{ts,tsx}", "**/testHelpers.ts", "frontend/src/test/**"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-require-imports": "off"
    }
  }
);
