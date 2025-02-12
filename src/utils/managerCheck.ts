import { ManagerOptions, SearchPlatform, TrackPartial, UseNodeOptions } from "../structures/Manager";

/**
 * Validates the provided ManagerOptions object.
 * @param options - The options to validate.
 * @throws {TypeError} Throws if any required option is missing or invalid.
 */
export default function managerCheck(options: ManagerOptions) {
	if (!options) throw new TypeError("ManagerOptions must not be empty.");

	const {
		autoPlay,
		clientName,
		defaultSearchPlatform,
		autoPlaySearchPlatform,
		nodes,
		plugins,
		send,
		trackPartial,
		usePriority,
		useNode,
		replaceYouTubeCredentials,
		lastFmApiKey,
	} = options;

	// Validate autoPlay option
	if (typeof autoPlay !== "boolean") {
		throw new TypeError('Manager option "autoPlay" must be a boolean.');
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

	// Validate autoPlaySearchPlatform
	if (typeof autoPlaySearchPlatform !== "undefined") {
		if (!Object.values(SearchPlatform).includes(autoPlaySearchPlatform)) {
			throw new TypeError(`Manager option "autoPlaySearchPlatform" must be one of: ${Object.values(SearchPlatform).join(", ")}.`);
		}
	}

	// Validate nodes option
	if (typeof nodes === "undefined" || !Array.isArray(nodes)) {
		throw new TypeError('Manager option "nodes" must be an array.');
	}

	// Validate plugins option
	if (typeof plugins !== "undefined" && !Array.isArray(plugins)) {
		throw new TypeError('Manager option "plugins" must be a Plugin array.');
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

	// Validate usePriority option
	if (typeof usePriority !== "undefined" && typeof usePriority !== "boolean") {
		throw new TypeError('Manager option "usePriority" must be a boolean.');
	}

	// Validate node priority if usePriority is enabled
	if (usePriority) {
		for (let index = 0; index < nodes.length; index++) {
			if (typeof nodes[index].priority !== "number" || isNaN(nodes[index].priority)) {
				throw new TypeError(`Missing or invalid node option "priority" at position ${index}`);
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

	// Validate replaceYouTubeCredentials option
	if (typeof replaceYouTubeCredentials !== "undefined" && typeof replaceYouTubeCredentials !== "boolean") {
		throw new TypeError('Manager option "replaceYouTubeCredentials" must be a boolean.');
	}

	// Validate lastFmApiKey option
	if (typeof lastFmApiKey !== "undefined" && (typeof lastFmApiKey !== "string" || lastFmApiKey.trim().length === 0)) {
		throw new TypeError('Manager option "lastFmApiKey" must be a non-empty string.');
	}
}
