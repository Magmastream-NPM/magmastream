import { GatewayReceivePayload, GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { Manager as BaseManager } from "../structures/Manager";
import type { Client, User } from "eris";
import { ManagerOptions, PortableUser, VoicePacket } from "../structures/Types";

export * from "../index";

/**
 * Eris wrapper for Magmastream.
 */
export class ErisManager extends BaseManager {
	public constructor(public readonly client: Client, options?: ManagerOptions) {
		super(options);

		client.once("ready", () => {
			if (!this.options.clientId) this.options.clientId = client.user.id;
		});

		client.on("rawWS", async (packet: GatewayReceivePayload) => {
			await this.updateVoiceState(packet as unknown as VoicePacket);
		});
	}

	protected override send(packet: GatewayVoiceStateUpdate) {
		const guild = this.client.guilds.get(packet.d.guild_id);
		if (guild) guild.shard.sendWS(packet.op, packet.d as unknown as Record<string, unknown>);
	}

	public override async resolveUser(user: PortableUser | string): Promise<User | PortableUser> {
		const id = typeof user === "string" ? user : user.id;
		const cached = this.client.users.get(id);
		if (cached) return cached;

		return {
			id,
			username: typeof user === "string" ? undefined : user.username,
		};
	}
}
