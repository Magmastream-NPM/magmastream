// THIS WILL BE REMOVED IF YOU DONT FIND A USE FOR IT.

import Redis from "ioredis";
import { Player } from "../structures/Player";
import { Manager } from "../structures/Manager";
import { PlayerStore } from "../structures/Types";

export class RedisPlayerStore implements PlayerStore {
	constructor(private readonly redis: Redis, private readonly manager: Manager, private readonly prefix: string = "magmastream:") {}

	private getKey(guildId: string) {
		return `${this.prefix}player:${guildId}`;
	}

	async get(guildId: string): Promise<Player | undefined> {
		const raw = await this.redis.get(this.getKey(guildId));
		if (!raw) return undefined;
		return JSON.parse(raw);
	}

	async set(guildId: string, player: Player): Promise<void> {
		const serialized = this.manager.serializePlayer(player);
		await this.redis.set(this.getKey(guildId), JSON.stringify(serialized));
	}

	async delete(guildId: string): Promise<void> {
		await this.redis.del(this.getKey(guildId));
	}

	async keys(): Promise<string[]> {
		const keys = await this.redis.keys(`${this.prefix}player:*`);
		return keys.map((key) => key.replace(`${this.prefix}player:`, ""));
	}

	async has(guildId: string): Promise<boolean> {
		return (await this.redis.exists(this.getKey(guildId))) === 1;
	}

	async filter(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<Map<string, Player>> {
		const keys = await this.keys();
		const pipeline = this.redis.pipeline();
		for (const guildId of keys) {
			pipeline.get(this.getKey(guildId));
		}
		const results = await pipeline.exec();

		const result = new Map<string, Player>();
		for (let i = 0; i < results.length; i++) {
			const [err, raw] = results[i];
			if (err || typeof raw !== "string") continue;

			const guildId = keys[i];
			const player: Player = JSON.parse(raw);
			if (await predicate(player, guildId)) {
				result.set(guildId, player);
			}
		}
		return result;
	}

	async find(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<Player | undefined> {
		for (const guildId of await this.keys()) {
			const raw = await this.redis.get(this.getKey(guildId));
			if (!raw) continue;
			const parsed = JSON.parse(raw);
			if (await predicate(parsed, guildId)) return parsed;
		}
		return undefined;
	}

	async map<T>(callback: (player: Player, guildId: string) => T | Promise<T>): Promise<T[]> {
		const keys = await this.keys();
		if (!keys.length) return [];

		const pipeline = this.redis.pipeline();
		for (const guildId of keys) {
			pipeline.get(this.getKey(guildId));
		}
		const results = await pipeline.exec();

		const output: T[] = [];
		for (let i = 0; i < results.length; i++) {
			const [err, raw] = results[i];
			if (err || typeof raw !== "string") continue;

			const guildId = keys[i];
			const player: Player = JSON.parse(raw);
			output.push(await callback(player, guildId));
		}
		return output;
	}

	async forEach(callback: (player: Player, guildId: string) => void | Promise<void>): Promise<void> {
		for (const guildId of await this.keys()) {
			const raw = await this.redis.get(this.getKey(guildId));
			if (!raw) continue;
			const parsed: Player = JSON.parse(raw);
			await callback(parsed, guildId);
		}
	}

	async some(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<boolean> {
		const keys = await this.keys();
		if (!keys.length) return false;

		const pipeline = this.redis.pipeline();
		for (const guildId of keys) {
			pipeline.get(this.getKey(guildId));
		}
		const results = await pipeline.exec();

		for (let i = 0; i < results.length; i++) {
			const [err, raw] = results[i];
			if (err || typeof raw !== "string") continue;

			const guildId = keys[i];
			const player: Player = JSON.parse(raw);
			if (await predicate(player, guildId)) return true;
		}
		return false;
	}

	async every(predicate: (player: Player, guildId: string) => boolean | Promise<boolean>): Promise<boolean> {
		const keys = await this.keys();
		if (!keys.length) return true;

		const pipeline = this.redis.pipeline();
		for (const guildId of keys) {
			pipeline.get(this.getKey(guildId));
		}
		const results = await pipeline.exec();

		for (let i = 0; i < results.length; i++) {
			const [err, raw] = results[i];
			if (err || typeof raw !== "string") continue;

			const guildId = keys[i];
			const player: Player = JSON.parse(raw);
			if (!(await predicate(player, guildId))) return false;
		}
		return true;
	}

	async size(): Promise<number> {
		const keys = await this.keys();
		return keys.length;
	}

	async clear(): Promise<void> {
		const keys = await this.redis.keys(`${this.prefix}player:*`);
		if (keys.length) {
			await this.redis.del(...keys);
		}
	}

	async *entries(): AsyncIterableIterator<[string, Player]> {
		for (const guildId of await this.keys()) {
			const raw = await this.redis.get(this.getKey(guildId));
			if (!raw) continue;
			yield [guildId, JSON.parse(raw)];
		}
	}
}
