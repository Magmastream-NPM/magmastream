import { MagmaStreamErrorCode } from "../structures/Enums";
import { MagmaStreamError } from "../structures/MagmastreamError";
import { PlayerOptions } from "../structures/Types";

/**
 * Validates the provided PlayerOptions object.
 * @param options - The options to validate.
 * @throws {MagmaStreamError} Throws if any required option is missing or invalid.
 */
export default function playerCheck(options: PlayerOptions) {
	if (!options) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: "PlayerOptions must not be empty.",
		});
	}

	const { guildId, nodeIdentifier, selfDeafen, selfMute, textChannelId, voiceChannelId, volume, applyVolumeAsFilter } = options;

	if (!/^\d+$/.test(guildId)) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "guildId" must be present and a non-empty string.',
			context: { guildId },
		});
	}

	if (nodeIdentifier && typeof nodeIdentifier !== "string") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "nodeIdentifier" must be a non-empty string.',
			context: { nodeIdentifier },
		});
	}

	if (typeof selfDeafen !== "undefined" && typeof selfDeafen !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "selfDeafen" must be a boolean.',
			context: { selfDeafen },
		});
	}

	if (typeof selfMute !== "undefined" && typeof selfMute !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "selfMute" must be a boolean.',
			context: { selfMute },
		});
	}

	if (textChannelId && !/^\d+$/.test(textChannelId)) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "textChannelId" must be a non-empty string.',
			context: { textChannelId },
		});
	}

	if (voiceChannelId && !/^\d+$/.test(voiceChannelId)) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "voiceChannelId" must be a non-empty string.',
			context: { voiceChannelId },
		});
	}

	if (typeof volume !== "undefined" && typeof volume !== "number") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "volume" must be a number.',
			context: { volume },
		});
	}

	if (typeof applyVolumeAsFilter !== "undefined" && typeof applyVolumeAsFilter !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.PLAYER_INVALID_CONFIG,
			message: 'Player option "applyVolumeAsFilter" must be a boolean.',
			context: { applyVolumeAsFilter },
		});
	}
}
