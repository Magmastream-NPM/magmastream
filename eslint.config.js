const eslintPluginTs = require("@typescript-eslint/eslint-plugin");
const eslintParserTs = require("@typescript-eslint/parser");
const eslintPluginImport = require("eslint-plugin-import");

module.exports = [
	{
		ignores: ["node_modules/", "dist/"],
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: eslintParserTs,
			sourceType: "module",
		},
		plugins: {
			"@typescript-eslint": eslintPluginTs,
			import: eslintPluginImport,
		},
		rules: {
			...eslintPluginTs.configs.recommended.rules,

			semi: ["error", "always"],
			"import/order": [
				"error",
				{
					groups: ["builtin", "external", "internal", ["parent", "sibling"], "index", "type"],
					"newlines-between": "never",
					alphabetize: {
						order: "asc",
						caseInsensitive: true,
					},
				},
			],
		},
	},
];
