import { AutoPlayPlatform, MagmaStreamErrorCode, SearchPlatform, TrackPartial, UseNodeOptions } from "../structures/Enums";
import { MagmaStreamError } from "../structures/MagmastreamError";
import { ManagerOptions } from "../structures/Types";

/**
 * Validates the provided ManagerOptions object.
 * @param options - The options to validate.
 * @throws {MagmaStreamError} Throws if any required option is missing or invalid.
 */
export default function managerCheck(options: ManagerOptions) {
	if (!options) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: "ManagerOptions must not be empty.",
			context: { option: "options" },
		});
	}
	const {
		playNextOnEnd,
		clientName,
		defaultSearchPlatform,
		autoPlaySearchPlatforms,
		nodes,
		enabledPlugins,
		send,
		trackPartial,
		enablePriorityMode,
		useNode,
		normalizeYouTubeTitles,
		lastFmApiKey,
		maxPreviousTracks,
	} = options;

	// Validate playNextOnEnd option
	if (typeof playNextOnEnd !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: 'Manager option "playNextOnEnd" must be a boolean.',
			context: { option: "playNextOnEnd", value: playNextOnEnd },
		});
	}

	// Validate clientName option
	if (typeof clientName !== "undefined") {
		if (typeof clientName !== "string" || clientName.trim().length === 0) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "clientName" must be a non-empty string.',
				context: { option: "clientName", value: clientName },
			});
		}
	}

	// Validate defaultSearchPlatform option
	if (typeof defaultSearchPlatform !== "undefined") {
		if (!Object.values(SearchPlatform).includes(defaultSearchPlatform)) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: `Manager option "defaultSearchPlatform" must be one of: ${Object.values(SearchPlatform).join(", ")}.`,
				context: { option: "defaultSearchPlatform", value: defaultSearchPlatform },
			});
		}
	}

	// Validate autoPlaySearchPlatforms
	if (typeof autoPlaySearchPlatforms !== "undefined") {
		if (!Array.isArray(autoPlaySearchPlatforms)) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "autoPlaySearchPlatforms" must be an array.',
				context: { option: "autoPlaySearchPlatforms", value: autoPlaySearchPlatforms },
			});
		}

		if (!autoPlaySearchPlatforms.every((platform) => Object.values(AutoPlayPlatform).includes(platform))) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "autoPlaySearchPlatforms" must be an array of valid AutoPlayPlatform values.',
				context: { option: "autoPlaySearchPlatforms", value: autoPlaySearchPlatforms },
			});
		}
	}

	// Validate nodes option
	if (typeof nodes === "undefined" || !Array.isArray(nodes)) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: 'Manager option "nodes" must be an array.',
			context: { option: "nodes", value: nodes },
		});
	}

	// Validate enabledPlugins option
	if (typeof enabledPlugins !== "undefined" && !Array.isArray(enabledPlugins)) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: 'Manager option "enabledPlugins" must be a Plugin array.',
			context: { option: "enabledPlugins", value: enabledPlugins },
		});
	}

	// Validate send option
	if (typeof send !== "undefined" && typeof send !== "function") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: 'Manager option "send" must be a function.',
			context: { option: "send", value: send },
		});
	}

	// Validate trackPartial option
	if (typeof trackPartial !== "undefined") {
		if (!Array.isArray(trackPartial)) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "trackPartial" must be an array.',
				context: { option: "trackPartial", value: trackPartial },
			});
		}
		if (!trackPartial.every((item) => Object.values(TrackPartial).includes(item))) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "trackPartial" must be an array of valid TrackPartial values.',
				context: { option: "trackPartial", value: trackPartial },
			});
		}
	}

	// Validate enablePriorityMode option
	if (typeof enablePriorityMode !== "undefined" && typeof enablePriorityMode !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: 'Manager option "enablePriorityMode" must be a boolean.',
			context: { option: "enablePriorityMode", value: enablePriorityMode },
		});
	}

	// Validate node priority if enablePriorityMode is enabled
	if (enablePriorityMode) {
		for (let index = 0; index < nodes.length; index++) {
			if (typeof nodes[index].nodePriority !== "number" || isNaN(nodes[index].nodePriority)) {
				throw new MagmaStreamError({
					code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
					message: `Missing or invalid node option "nodePriority" at position ${index}.`,
					context: { option: "nodePriority", index, value: nodes[index].nodePriority },
				});
			}
		}
	}

	// Validate useNode option
	if (typeof useNode !== "undefined") {
		if (typeof useNode !== "string") {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "useNode" must be a string "leastLoad" or "leastPlayers".',
				context: { option: "useNode", value: useNode },
			});
		}

		if (!Object.values(UseNodeOptions).includes(useNode as UseNodeOptions)) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "useNode" must be either "leastLoad" or "leastPlayers".',
				context: { option: "useNode", value: useNode },
			});
		}
	}

	// Validate normalizeYouTubeTitles option
	if (typeof normalizeYouTubeTitles !== "undefined" && typeof normalizeYouTubeTitles !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: 'Manager option "normalizeYouTubeTitles" must be a boolean.',
			context: { option: "normalizeYouTubeTitles", value: normalizeYouTubeTitles },
		});
	}

	// Validate lastFmApiKey option
	if (typeof lastFmApiKey !== "undefined" && (typeof lastFmApiKey !== "string" || lastFmApiKey.trim().length === 0)) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
			message: 'Manager option "lastFmApiKey" must be a non-empty string.',
			context: { option: "lastFmApiKey", value: lastFmApiKey },
		});
	}

	// Validate maxPreviousTracks option
	if (typeof maxPreviousTracks !== "undefined") {
		if (typeof maxPreviousTracks !== "number" || isNaN(maxPreviousTracks)) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "maxPreviousTracks" must be a number.',
				context: { option: "maxPreviousTracks", value: maxPreviousTracks },
			});
		}
		if (maxPreviousTracks <= 0) {
			throw new MagmaStreamError({
				code: MagmaStreamErrorCode.MANAGER_INVALID_CONFIG,
				message: 'Manager option "maxPreviousTracks" must be a positive number.',
				context: { option: "maxPreviousTracks", value: maxPreviousTracks },
			});
		}
	}
}
