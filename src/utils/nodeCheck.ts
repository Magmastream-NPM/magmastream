import { NodeOptions } from "../structures/Node";

/**
 * Validates the provided NodeOptions object.
 * @param options - The options to validate.
 * @throws {TypeError} Throws if any required option is missing or invalid.
 */
export default function nodeCheck(options: NodeOptions) {
	// If the options are empty, throw an error.
	if (!options) throw new TypeError("NodeOptions must not be empty.");

	// Validate the host option
	// The host option must be present and be a non-empty string.
	const { host, identifier, password, port, resumeStatus, resumeTimeout, retryAmount, retryDelay, secure, priority } = options;

	if (typeof host !== "string" || !/.+/.test(host)) {
		throw new TypeError('Node option "host" must be present and be a non-empty string.');
	}

	// Validate the identifier option
	// The identifier option must be a non-empty string or undefined.
	if (typeof identifier !== "undefined" && typeof identifier !== "string") {
		throw new TypeError('Node option "identifier" must be a non-empty string.');
	}

	// Validate the password option
	// The password option must be a non-empty string or undefined.
	if (typeof password !== "undefined" && (typeof password !== "string" || !/.+/.test(password))) {
		throw new TypeError('Node option "password" must be a non-empty string.');
	}

	// Validate the port option
	// The port option must be a number or undefined.
	if (typeof port !== "undefined" && typeof port !== "number") {
		throw new TypeError('Node option "port" must be a number.');
	}

	// Validate the resumeStatus option
	// The resumeStatus option must be a boolean or undefined.
	if (typeof resumeStatus !== "undefined" && typeof resumeStatus !== "boolean") {
		throw new TypeError('Node option "resumeStatus" must be a boolean.');
	}

	// Validate the resumeTimeout option
	// The resumeTimeout option must be a number or undefined.
	if (typeof resumeTimeout !== "undefined" && typeof resumeTimeout !== "number") {
		throw new TypeError('Node option "resumeTimeout" must be a number.');
	}

	// Validate the retryAmount option
	// The retryAmount option must be a number or undefined.
	if (typeof retryAmount !== "undefined" && typeof retryAmount !== "number") {
		throw new TypeError('Node option "retryAmount" must be a number.');
	}

	// Validate the retryDelay option
	// The retryDelay option must be a number or undefined.
	if (typeof retryDelay !== "undefined" && typeof retryDelay !== "number") {
		throw new TypeError('Node option "retryDelay" must be a number.');
	}

	// Validate the secure option
	// The secure option must be a boolean or undefined.
	if (typeof secure !== "undefined" && typeof secure !== "boolean") {
		throw new TypeError('Node option "secure" must be a boolean.');
	}

	// Validate the priority option
	// The priority option must be a number or undefined.
	if (typeof priority !== "undefined" && typeof priority !== "number") {
		throw new TypeError('Node option "priority" must be a number.');
	}
}
