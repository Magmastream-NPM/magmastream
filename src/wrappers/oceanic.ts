import { GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { Manager as BaseManager } from "../structures/Manager";
import { AnyUser, ManagerOptions, VoicePacket } from "../structures/Types";
import type { Client, User } from "oceanic.js";

export * from "../index";

/**
 * Oceanic wrapper for Magmastream.
 */
export class OceanicManager extends BaseManager {
	constructor(public readonly client: Client, options?: ManagerOptions) {
		super(options);

		client.once("ready", () => {
			if (!this.options.clientId) this.options.clientId = client.user.id;
		});

		client.on("packet", async (packet) => {
			await this.updateVoiceState(packet as unknown as VoicePacket);
		});
	}

	protected override send(packet: GatewayVoiceStateUpdate) {
		const guild = this.client.guilds.get(packet.d.guild_id);
		if (guild) guild.shard.send(packet.op as number, packet.d);
	}

	public override async resolveUser(user: AnyUser | string): Promise<User | AnyUser> {
		const id = typeof user === "string" ? user : user.id;
		const cached = this.client.users.get(id);
		if (cached) return cached;

		return {
			id,
			username: typeof user === "string" ? undefined : user.username,
		};
	}
}
