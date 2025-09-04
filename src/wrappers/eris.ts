import { GatewayReceivePayload, GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { Manager as BaseManager } from "../structures/Manager";
import type { Client } from "eris";
import { ManagerOptions, VoicePacket } from "../structures/Types";

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
	};

	protected override send(packet: GatewayVoiceStateUpdate) {
		const guild = this.client.guilds.get(packet.d.guild_id);
		if (guild) guild.shard.sendWS(packet.op, packet.d as unknown as Record<string, unknown>);
	};
};