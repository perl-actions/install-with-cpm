import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {files: ["index.js", "lib.js"], languageOptions: {sourceType: "module"}},
  {files: ["**/*.test.js"], languageOptions: {sourceType: "module", globals: globals.jest}},
  {languageOptions: { globals: globals.node }},
  pluginJs.configs.recommended,
];
