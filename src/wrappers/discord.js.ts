import { Manager as BaseManager } from "../structures/Manager";
import type { GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { Client } from "discord.js";
import { ManagerOptions, VoicePacket } from "../structures/Types";

export * from "../index";

/**
 * Discord.js wrapper for Magmastream.
 */
export class DiscordJSManager extends BaseManager {
	public constructor(public readonly client: Client, options?: ManagerOptions) {
		super(options);

		client.once("ready", () => {
			if (!this.options.clientId) this.options.clientId = client.user!.id;
		});
		client.on("raw", async (data) => {
			await this.updateVoiceState(data as unknown as VoicePacket);
		});
	}

	protected override send(packet: GatewayVoiceStateUpdate) {
		const guild = this.client.guilds.cache.get(packet.d.guild_id);
		if (guild) guild.shard.send(packet);
	}
}
