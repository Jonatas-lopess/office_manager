import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslint from "@eslint/js";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    ignores: ["src-tauri/**", "dist/**"],
  },
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    files: ["**/*.{ts,mts,cts,tsx}"],
    rules: {
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/prop-types": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper"] },
      ],
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
);
