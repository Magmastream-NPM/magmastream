import { Manager } from "./Manager";

/**
 * Base abstract class for all plugins.
 * Users must extend this and implement load and unload methods.
 */
export abstract class Plugin {
	public readonly name: string;

	/**
	 * @param name The name of the plugin
	 */
	constructor(name: string) {
		this.name = name;
	}

	/**
	 * Load the plugin.
	 * @param manager The MagmaStream Manager instance
	 */
	abstract load(manager: Manager): void;

	/**
	 * Unload the plugin.
	 * Called on shutdown to gracefully cleanup resources or detach listeners.
	 * @param manager The MagmaStream Manager instance
	 */
	abstract unload(manager: Manager): void;
}
