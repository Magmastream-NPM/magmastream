import { GatewayReceivePayload, GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { Manager as BaseManager } from "../structures/Manager";
import { AnyUser, ManagerOptions, VoicePacket } from "../structures/Types";

import { ClusterClient, ShardClient } from "detritus-client";

export * from "../index";

/**
 * Detritus wrapper for Magmastream.
 */
export class DetritusManager extends BaseManager {
	public constructor(public readonly client: ClusterClient | ShardClient, options?: ManagerOptions) {
		super(options);

		client.once("ready", () => {
			if (!this.options.clientId) this.options.clientId = client instanceof ClusterClient ? client.applicationId : client.clientId;
		});

		client.on("raw", async (packet: GatewayReceivePayload) => {
			await this.updateVoiceState(packet as unknown as VoicePacket);
		});
	}

	protected override send(packet: GatewayVoiceStateUpdate) {
		const asCluster = this.client as ClusterClient;
		const asShard = this.client as ShardClient;

		if (asShard.guilds) return asShard.gateway.send(packet.op, packet.d);
		if (asCluster.shards) {
			const shard = asCluster.shards.find((c) => c.guilds.has(packet.d.guild_id));
			if (shard) shard.gateway.send(packet.op, packet.d);
		}
	}

	public override async resolveUser(user: AnyUser | string): Promise<AnyUser> {
		const id = typeof user === "string" ? user : user.id;

		if (this.client instanceof ShardClient) {
			const cached = this.client.users.get(id);
			if (cached) return { id: cached.id, username: cached.username };
		} else if (this.client instanceof ClusterClient) {
			for (const [, shard] of this.client.shards) {
				const cached = shard.users.get(id);
				if (cached) return { id: cached.id, username: cached.username };
			}
		}

		return typeof user === "string" ? { id: user } : user;
	}
}
