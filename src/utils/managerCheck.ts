import { ManagerOptions } from "../structures/Manager";

export default function managerCheck(options: ManagerOptions) {
	if (!options) throw new TypeError("ManagerOptions must not be empty.");

	const { autoPlay, clientId, clientName, defaultSearchPlatform, nodes, plugins, send, shards, trackPartial, usePriority, useNode, replaceYouTubeCredentials } =
		options;

	if (typeof autoPlay !== "undefined" && typeof autoPlay !== "boolean") {
		throw new TypeError('Manager option "autoPlay" must be a boolean.');
	}

	if (typeof clientId !== "undefined" && !/^\d+$/.test(clientId)) {
		throw new TypeError('Manager option "clientId" must be a non-empty string.');
	}

	if (typeof clientName !== "undefined" && typeof clientName !== "string") {
		throw new TypeError('Manager option "clientName" must be a string.');
	}

	if (typeof defaultSearchPlatform !== "undefined" && typeof defaultSearchPlatform !== "string") {
		throw new TypeError('Manager option "defaultSearchPlatform" must be a string.');
	}

	if (typeof nodes !== "undefined" && !Array.isArray(nodes)) {
		throw new TypeError('Manager option "nodes" must be an array.');
	}

	if (typeof plugins !== "undefined" && !Array.isArray(plugins)) {
		throw new TypeError('Manager option "plugins" must be a Plugin array.');
	}

	if (typeof send !== "function") {
		throw new TypeError('Manager option "send" must be present and a function.');
	}

	if (typeof shards !== "undefined" && typeof shards !== "number") {
		throw new TypeError('Manager option "shards" must be a number.');
	}

	if (typeof trackPartial !== "undefined" && !Array.isArray(trackPartial)) {
		throw new TypeError('Manager option "trackPartial" must be a string array.');
	}

	if (typeof usePriority !== "undefined" && typeof usePriority !== "boolean") {
		throw new TypeError('Manager option "usePriority" must be a boolean.');
	}

	if (usePriority) {
		for (let index = 0; index < nodes.length; index++) {
			if (!nodes[index].priority) {
				throw new TypeError(`Missing node option "priority" at position ${index}`);
			}
		}
	}

	if (typeof useNode !== "undefined") {
		if (typeof useNode !== "string") {
			throw new TypeError('Manager option "useNode" must be a string "leastLoad" or "leastPlayers".');
		}

		if (useNode !== "leastLoad" && useNode !== "leastPlayers") {
			throw new TypeError('Manager option must be either "leastLoad" or "leastPlayers".');
		}
	}

	if (typeof replaceYouTubeCredentials !== "undefined" && typeof replaceYouTubeCredentials !== "boolean") {
		throw new TypeError('Manager option "replaceYouTubeCredentials" must be a boolean.');
	}
}
