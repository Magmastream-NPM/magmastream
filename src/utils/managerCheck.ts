import { ManagerOptions, SearchPlatforms, UseNodeOptions } from "../structures/Manager";

export default function managerCheck(options: ManagerOptions) {
	if (!options) throw new TypeError("ManagerOptions must not be empty.");

	const { autoPlay, clientName, defaultSearchPlatform, nodes, plugins, send, trackPartial, usePriority, useNode, replaceYouTubeCredentials, lastFmApiKey } =
		options;

	if (typeof autoPlay !== "boolean") {
		throw new TypeError('Manager option "autoPlay" must be a boolean.');
	}

	if (typeof clientName !== "undefined") {

		if (typeof clientName !== "string" || clientName.trim().length === 0) {
			throw new TypeError('Manager option "clientName" must be a non-empty string.');
		}
	}

	if (typeof defaultSearchPlatform !== "undefined") {
		if (typeof defaultSearchPlatform !== "string" || !Object.values(SearchPlatforms).includes(defaultSearchPlatform)) {
			throw new TypeError(`Manager option "defaultSearchPlatform" must be one of: ${Object.values(SearchPlatforms).join(", ")}.`);
		}
	}

	if (typeof nodes === "undefined" || !Array.isArray(nodes)) {
		throw new TypeError('Manager option "nodes" must be an array.');
	}

	if (typeof plugins !== "undefined" && !Array.isArray(plugins)) {
		throw new TypeError('Manager option "plugins" must be a Plugin array.');
	}

	if (typeof send !== "function") {
		throw new TypeError('Manager option "send" must be present and a function.');
	}

	if (typeof trackPartial !== "undefined") {
		if (!Array.isArray(trackPartial)) {
			throw new TypeError('Manager option "trackPartial" must be an array.');
		}
		if (!trackPartial.every(item => typeof item === "string")) {
			throw new TypeError('Manager option "trackPartial" must be an array of strings.');
		}
	}

	if (typeof usePriority !== "undefined" && typeof usePriority !== "boolean") {
		throw new TypeError('Manager option "usePriority" must be a boolean.');
	}
	

	if (usePriority) {
		for (let index = 0; index < nodes.length; index++) {
			if (typeof nodes[index].priority !== 'number' || isNaN(nodes[index].priority)) {
				throw new TypeError(`Missing or invalid node option "priority" at position ${index}`);
			}
		}
	}

	if (typeof useNode !== "undefined") {
		if (typeof useNode !== "string") {
			throw new TypeError('Manager option "useNode" must be a string "leastLoad" or "leastPlayers".');
		}

		if (!(useNode in UseNodeOptions)) {
			throw new TypeError('Manager option "useNode" must be either "leastLoad" or "leastPlayers".');
		}
	}

	if (typeof replaceYouTubeCredentials !== "undefined" && typeof replaceYouTubeCredentials !== "boolean") {
		throw new TypeError('Manager option "replaceYouTubeCredentials" must be a boolean.');
	}

	if (typeof lastFmApiKey !== "undefined" && (typeof lastFmApiKey !== "string" || lastFmApiKey.trim().length === 0)) {
		throw new TypeError('Manager option "lastFmApiKey" must be a non-empty string.');
	}
	
}
