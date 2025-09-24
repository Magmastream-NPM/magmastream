import { Manager as BaseManager } from "../structures/Manager";
import type { GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { Client, User } from "discord.js";
import { ManagerOptions, PortableUser, VoicePacket } from "../structures/Types";
import { version as djsVersion } from "discord.js";
const [major, minor] = djsVersion.split(".").map(Number);

export * from "../index";

/**
 * Discord.js wrapper for Magmastream.
 */
export class DiscordJSManager extends BaseManager {
	public constructor(public readonly client: Client, options?: ManagerOptions) {
		super(options);

		const attachReadyHandler = () => {
			const handler = () => {
				if (!this.options.clientId) this.options.clientId = this.client.user!.id;
			};

			// Only attach clientReady if Discord.js >= 14.22.0
			if (major > 14 || (major === 14 && minor >= 22)) {
				client.once("clientReady", handler);
			}

			// Only attach ready if Discord.js < 14.22.0
			if (major < 14 || (major === 14 && minor < 22)) {
				client.once("ready", handler);
			}
		};

		attachReadyHandler();

		client.on("raw", async (data) => {
			await this.updateVoiceState(data as unknown as VoicePacket);
		});
	}

	protected override send(packet: GatewayVoiceStateUpdate) {
		const guild = this.client.guilds.cache.get(packet.d.guild_id);
		if (guild) guild.shard.send(packet);
	}

	public override async resolveUser(user: PortableUser | string): Promise<User | PortableUser> {
		const id = typeof user === "string" ? user : user.id;
		const cached = this.client.users.cache.get(id);
		if (cached) return cached;
		try {
			const fetched = await this.client.users.fetch(id);
			return fetched;
		} catch {
			return { id, username: typeof user === "string" ? undefined : user.username };
		}
	}
}
