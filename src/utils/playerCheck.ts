import { PlayerOptions } from "../structures/Types";

/**
 * Validates the provided PlayerOptions object.
 * @param options - The options to validate.
 * @throws {TypeError} Throws if any required option is missing or invalid.
 */
export default function playerCheck(options: PlayerOptions) {
	// If the options are empty, throw an error.
	if (!options) {
		throw new TypeError("PlayerOptions must not be empty.");
	}

	// Get the guild ID, node, selfDeafen, selfMute, textChannelId, voiceChannelId, volume, and applyVolumeAsFilter from the options.
	const { guildId, nodeIdentifier, selfDeafen, selfMute, textChannelId, voiceChannelId, volume, applyVolumeAsFilter } = options;

	// Validate the guild ID option
	// The guild ID option must be a non-empty string.
	if (!/^\d+$/.test(guildId)) {
		throw new TypeError('Player option "guild ID" must be present and be a non-empty string.');
	}

	// Validate the node option
	// The node option must be a string.
	if (nodeIdentifier && typeof nodeIdentifier !== "string") {
		throw new TypeError('Player option "nodeIdentifier" must be a non-empty string.');
	}

	// Validate the selfDeafen option
	// The selfDeafen option must be a boolean.
	if (typeof selfDeafen !== "undefined" && typeof selfDeafen !== "boolean") {
		throw new TypeError('Player option "selfDeafen" must be a boolean.');
	}

	// Validate the selfMute option
	// The selfMute option must be a boolean.
	if (typeof selfMute !== "undefined" && typeof selfMute !== "boolean") {
		throw new TypeError('Player option "selfMute" must be a boolean.');
	}

	// Validate the textChannelId option
	// The textChannelId option must be a non-empty string.
	if (textChannelId && !/^\d+$/.test(textChannelId)) {
		throw new TypeError('Player option "textChannelId" must be a non-empty string.');
	}

	// Validate the voiceChannelId option
	// The voiceChannelId option must be a non-empty string.
	if (voiceChannelId && !/^\d+$/.test(voiceChannelId)) {
		throw new TypeError('Player option "voiceChannelId" must be a non-empty string.');
	}

	// Validate the volume option
	// The volume option must be a number.
	if (typeof volume !== "undefined" && typeof volume !== "number") {
		throw new TypeError('Player option "volume" must be a number.');
	}

	// Validate the applyVolumeAsFilter option
	// The applyVolumeAsFilter option must be a boolean.
	if (typeof applyVolumeAsFilter !== "undefined" && typeof applyVolumeAsFilter !== "boolean") {
		throw new TypeError('Player option "applyVolumeAsFilter" must be a boolean.');
	}
}
