import { ManagerOptions } from "../structures/Manager";

export default function managerCheck(options: ManagerOptions) {
  if (!options) throw new TypeError("ManagerOptions must not be empty.");

  const {
    autoPlay,
    clientId,
    clientName,
    defaultSearchPlatform,
    nodes,
    plugins,
    send,
    shards,
    trackPartial,
  } = options;

  if (typeof autoPlay !== "undefined" && typeof autoPlay !== "boolean") {
    throw new TypeError('Manager option "autoPlay" must be a boolean.');
  }

  if (typeof clientId !== "undefined" && !/^\d+$/.test(clientId)) {
    throw new TypeError(
      'Manager option "clientId" must be a non-empty string.'
    );
  }

  if (typeof clientName !== "undefined" && typeof clientName !== "string") {
    throw new TypeError('Manager option "clientName" must be a string.');
  }

  if (
    typeof defaultSearchPlatform !== "undefined" &&
    typeof defaultSearchPlatform !== "string"
  ) {
    throw new TypeError(
      'Manager option "defaultSearchPlatform" must be a string.'
    );
  }

  if (typeof nodes !== "undefined" && !Array.isArray(nodes)) {
    throw new TypeError('Manager option "nodes" must be an array.');
  }

  if (typeof plugins !== "undefined" && !Array.isArray(plugins)) {
    throw new TypeError('Manager option "plugins" must be a Plugin array.');
  }

  if (typeof send !== "function") {
    throw new TypeError(
      'Manager option "send" must be present and a function.'
    );
  }

  if (typeof shards !== "undefined" && typeof shards !== "number") {
    throw new TypeError('Manager option "shards" must be a number.');
  }

  if (typeof trackPartial !== "undefined" && !Array.isArray(trackPartial)) {
    throw new TypeError(
      'Manager option "trackPartial" must be a string array.'
    );
  }
}
