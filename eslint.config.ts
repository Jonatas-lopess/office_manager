import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{ts,mts,cts,tsx}"],
    plugins: { tseslint },
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
]);
