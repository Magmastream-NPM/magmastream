import { Collection } from "@discordjs/collection";
import { Player } from "../structures/Player";
import { PlayerStore } from "../structures/Manager";

export class CollectionPlayerStore implements PlayerStore {
	private store: Collection<string, Player> = new Collection();

	async get(guildId: string): Promise<Player | undefined> {
		return this.store.get(guildId);
	}

	async set(guildId: string, player: Player): Promise<void> {
		this.store.set(guildId, player);
	}

	async delete(guildId: string): Promise<void> {
		this.store.delete(guildId);
	}

	async keys(): Promise<string[]> {
		return [...this.store.keys()];
	}

	async has(guildId: string): Promise<boolean> {
		return this.store.has(guildId);
	}

	async filter(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<Map<string, Player>> {
		const result = new Map<string, Player>();
		for (const [guildId, player] of this.store.entries()) {
			if (await predicate(player, guildId)) {
				result.set(guildId, player);
			}
		}
		return result;
	}

	async find(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<Player | undefined> {
		for (const [guildId, player] of this.store.entries()) {
			if (await predicate(player, guildId)) return player;
		}
		return undefined;
	}

	async map<T>(callback: (player: Player, guildId: string) => T | Promise<T>): Promise<T[]> {
		const results: T[] = [];
		for (const [guildId, player] of this.store.entries()) {
			results.push(await callback(player, guildId));
		}
		return results;
	}

	async forEach(callback: (player: Player, guildId: string) => void | Promise<void>): Promise<void> {
		for (const [guildId, player] of this.store.entries()) {
			await callback(player, guildId);
		}
	}

	async some(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<boolean> {
		for (const [guildId, player] of this.store.entries()) {
			if (await predicate(player, guildId)) return true;
		}
		return false;
	}

	async every(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<boolean> {
		for (const [guildId, player] of this.store.entries()) {
			if (!(await predicate(player, guildId))) return false;
		}
		return true;
	}

	async size(): Promise<number> {
		return this.store.size;
	}

	async clear(): Promise<void> {
		this.store.clear();
	}

	async *entries(): AsyncIterableIterator<[string, Player]> {
		for (const entry of this.store.entries()) {
			yield entry;
		}
	}
}
