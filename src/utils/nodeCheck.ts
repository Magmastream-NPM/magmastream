import { NodeOptions } from "../structures/Types";
import { MagmaStreamError } from "../structures/MagmastreamError";
import { MagmaStreamErrorCode } from "../structures/Enums";

/**
 * Validates the provided NodeOptions object.
 * @param options - The options to validate.
 * @throws {MagmaStreamError} Throws if any required option is missing or invalid.
 */
export default function nodeCheck(options: NodeOptions) {
	if (!options) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: "NodeOptions must not be empty.",
		});
	}

	const { host, identifier, password, port, enableSessionResumeOption, sessionTimeoutSeconds, maxRetryAttempts, retryDelayMs, useSSL, nodePriority } = options;

	if (typeof host !== "string" || !/.+/.test(host)) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "host" must be present and be a non-empty string.',
			context: { host },
		});
	}

	if (typeof identifier !== "undefined" && typeof identifier !== "string") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "identifier" must be a non-empty string.',
			context: { identifier },
		});
	}

	if (typeof password !== "undefined" && (typeof password !== "string" || !/.+/.test(password))) {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "password" must be a non-empty string.',
			context: { password },
		});
	}

	if (typeof port !== "undefined" && typeof port !== "number") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "port" must be a number.',
			context: { port },
		});
	}

	if (typeof enableSessionResumeOption !== "undefined" && typeof enableSessionResumeOption !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "enableSessionResumeOption" must be a boolean.',
			context: { enableSessionResumeOption },
		});
	}

	if (typeof sessionTimeoutSeconds !== "undefined" && typeof sessionTimeoutSeconds !== "number") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "sessionTimeoutSeconds" must be a number.',
			context: { sessionTimeoutSeconds },
		});
	}

	if (typeof maxRetryAttempts !== "undefined" && typeof maxRetryAttempts !== "number") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "maxRetryAttempts" must be a number.',
			context: { maxRetryAttempts },
		});
	}

	if (typeof retryDelayMs !== "undefined" && typeof retryDelayMs !== "number") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "retryDelayMs" must be a number.',
			context: { retryDelayMs },
		});
	}

	if (typeof useSSL !== "undefined" && typeof useSSL !== "boolean") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "useSSL" must be a boolean.',
			context: { useSSL },
		});
	}

	if (typeof nodePriority !== "undefined" && typeof nodePriority !== "number") {
		throw new MagmaStreamError({
			code: MagmaStreamErrorCode.NODE_PROTOCOL_ERROR,
			message: 'Node option "nodePriority" must be a number.',
			context: { nodePriority },
		});
	}
}
