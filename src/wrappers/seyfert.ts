import { Manager as BaseManager } from "../structures/Manager";
import type { GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { Client } from "seyfert";
import { ManagerOptions } from "../structures/Types";
import { calculateShardId } from "seyfert/lib/common";

export * from "../index";

/**
 * Seyfert wrapper for Magmastream.
 *
 * @note This wrapper does require the manual implementation of the "raw" and "ready" events, to call the `updateVoiceState` and `init` methods respectively.
 *
 * @example
 * ```typescript
 * const client = new Client();
 * const manager = new SeyfertManager(client, options);
 *
 * client.events.values.RAW = {
 *     data: { name: "raw" },
 *     run: async (data) => {
 *         await manager.updateVoiceState(data);
 *     }
 * }
 *
 * client.events.values.READY = {
 *     data: { name: "ready" },
 *     run: async (user, client) => {
 *         await manager.init({ clientId: client.botId });
 *     }
 * }
 * ```
 */
export class SeyfertManager extends BaseManager {
	public constructor(public readonly client: Client, options?: ManagerOptions) {
		super(options);
	};

	protected override async send(packet: GatewayVoiceStateUpdate) {
		await this.client.gateway.send(calculateShardId(packet.d.guild_id), packet);
	};
};