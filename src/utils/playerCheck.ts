import { PlayerOptions } from "../structures/Player";

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

	// Get the guild, node, selfDeafen, selfMute, textChannel, voiceChannel, and volume from the options.
	const { guild, node, selfDeafen, selfMute, textChannel, voiceChannel, volume } = options;

	// Validate the guild option
	// The guild option must be a non-empty string.
	if (!/^\d+$/.test(guild)) {
		throw new TypeError('Player option "guild" must be present and be a non-empty string.');
	}

	// Validate the node option
	// The node option must be a string.
	if (node && typeof node !== "string") {
		throw new TypeError('Player option "node" must be a non-empty string.');
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

	// Validate the textChannel option
	// The textChannel option must be a non-empty string.
	if (textChannel && !/^\d+$/.test(textChannel)) {
		throw new TypeError('Player option "textChannel" must be a non-empty string.');
	}

	// Validate the voiceChannel option
	// The voiceChannel option must be a non-empty string.
	if (voiceChannel && !/^\d+$/.test(voiceChannel)) {
		throw new TypeError('Player option "voiceChannel" must be a non-empty string.');
	}

	// Validate the volume option
	// The volume option must be a number.
	if (typeof volume !== "undefined" && typeof volume !== "number") {
		throw new TypeError('Player option "volume" must be a number.');
	}
}

