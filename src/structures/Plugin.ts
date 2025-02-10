/* eslint-disable @typescript-eslint/no-unused-vars */
import { Manager } from "./Manager";

export class Plugin {
	name: string;
	/**
	 * @param name The name of the plugin
	 */
	constructor(name: string) {
		this.name = name;
	}

	public load(manager: Manager): void {}
}
