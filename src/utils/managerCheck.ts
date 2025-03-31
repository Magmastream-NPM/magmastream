import { AutoPlayPlatform, ManagerOptions, SearchPlatform, TrackPartial, UseNodeOptions } from "../structures/Manager";

/**
 * Validates the provided ManagerOptions object.
 * @param options - The options to validate.
 * @throws {TypeError} Throws if any required option is missing or invalid.
 */
export default function managerCheck(options: ManagerOptions) {
	if (!options) throw new TypeError("ManagerOptions must not be empty.");

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
		throw new TypeError('Manager option "playNextOnEnd" must be a boolean.');
	}

	// Validate clientName option
	if (typeof clientName !== "undefined") {
		if (typeof clientName !== "string" || clientName.trim().length === 0) {
			throw new TypeError('Manager option "clientName" must be a non-empty string.');
		}
	}

	// Validate defaultSearchPlatform option
	if (typeof defaultSearchPlatform !== "undefined") {
		if (!Object.values(SearchPlatform).includes(defaultSearchPlatform)) {
			throw new TypeError(`Manager option "defaultSearchPlatform" must be one of: ${Object.values(SearchPlatform).join(", ")}.`);
		}
	}

	// Validate autoPlaySearchPlatforms
	if (typeof autoPlaySearchPlatforms !== "undefined") {
		if (!Array.isArray(autoPlaySearchPlatforms)) {
			throw new TypeError('Manager option "autoPlaySearchPlatforms" must be an array.');
		}

		if (!autoPlaySearchPlatforms.every((platform) => Object.values(AutoPlayPlatform).includes(platform))) {
			throw new TypeError(`Manager option "autoPlaySearchPlatforms" must be an array of valid AutoPlayPlatform values.`);
		}
	}

	// Validate nodes option
	if (typeof nodes === "undefined" || !Array.isArray(nodes)) {
		throw new TypeError('Manager option "nodes" must be an array.');
	}

	// Validate enabledPlugins option
	if (typeof enabledPlugins !== "undefined" && !Array.isArray(enabledPlugins)) {
		throw new TypeError('Manager option "enabledPlugins" must be a Plugin array.');
	}

	// Validate send option
	if (typeof send !== "function") {
		throw new TypeError('Manager option "send" must be present and a function.');
	}

	// Validate trackPartial option
	if (typeof trackPartial !== "undefined") {
		if (!Array.isArray(trackPartial)) {
			throw new TypeError('Manager option "trackPartial" must be an array.');
		}
		if (!trackPartial.every((item) => Object.values(TrackPartial).includes(item))) {
			throw new TypeError('Manager option "trackPartial" must be an array of valid TrackPartial values.');
		}
	}

	// Validate enablePriorityMode option
	if (typeof enablePriorityMode !== "undefined" && typeof enablePriorityMode !== "boolean") {
		throw new TypeError('Manager option "enablePriorityMode" must be a boolean.');
	}

	// Validate node priority if enablePriorityMode is enabled
	if (enablePriorityMode) {
		for (let index = 0; index < nodes.length; index++) {
			if (typeof nodes[index].nodePriority !== "number" || isNaN(nodes[index].nodePriority)) {
				throw new TypeError(`Missing or invalid node option "nodePriority" at position ${index}`);
			}
		}
	}

	// Validate useNode option
	if (typeof useNode !== "undefined") {
		if (typeof useNode !== "string") {
			throw new TypeError('Manager option "useNode" must be a string "leastLoad" or "leastPlayers".');
		}

		if (!Object.values(UseNodeOptions).includes(useNode as UseNodeOptions)) {
			throw new TypeError('Manager option "useNode" must be either "leastLoad" or "leastPlayers".');
		}
	}

	// Validate normalizeYouTubeTitles option
	if (typeof normalizeYouTubeTitles !== "undefined" && typeof normalizeYouTubeTitles !== "boolean") {
		throw new TypeError('Manager option "normalizeYouTubeTitles" must be a boolean.');
	}

	// Validate lastFmApiKey option
	if (typeof lastFmApiKey !== "undefined" && (typeof lastFmApiKey !== "string" || lastFmApiKey.trim().length === 0)) {
		throw new TypeError('Manager option "lastFmApiKey" must be a non-empty string.');
	}

	// Validate maxPreviousTracks option
	if (typeof maxPreviousTracks !== "undefined") {
		if (typeof maxPreviousTracks !== "number" || isNaN(maxPreviousTracks)) {
			throw new TypeError('Manager option "maxPreviousTracks" must be a number.');
		}
		if (maxPreviousTracks <= 0) {
			throw new TypeError('Manager option "maxPreviousTracks" must be a positive number.');
		}
	}
}
