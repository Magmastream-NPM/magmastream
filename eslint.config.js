const eslintPlugin = require("@typescript-eslint/eslint-plugin");
const eslintParser = require("@typescript-eslint/parser");

module.exports = [
	{
		ignores: ["node_modules/", "dist/"],
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: eslintParser,
			sourceType: "module",
		},
		plugins: {
			"@typescript-eslint": eslintPlugin,
		},
		rules: {
			...eslintPlugin.configs.recommended.rules,
		},
	},
];
