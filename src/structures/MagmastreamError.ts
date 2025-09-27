import { MagmaStreamErrorCode, MagmaStreamErrorNumbers } from "./Enums";

interface MagmaStreamErrorOptions<T = unknown> {
	code: MagmaStreamErrorCode;
	message?: string;
	cause?: Error;
	context?: T;
}

export class MagmaStreamError<T = unknown> extends Error {
	public readonly code: MagmaStreamErrorCode;
	public readonly number: number;
	public readonly context?: T;

	constructor({ code, message, cause, context }: MagmaStreamErrorOptions<T>) {
		super(message || code);
		this.name = "MagmaStreamError";
		this.code = code;
		this.number = MagmaStreamErrorNumbers[code]; // auto-lookup
		this.context = context;
		if (cause) this.cause = cause;
	}
}
