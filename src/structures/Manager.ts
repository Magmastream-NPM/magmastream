import { AutoPlayUtils, PlayerUtils, Structure, TrackUtils } from "./Utils";
import { Collection } from "@discordjs/collection";
import { GatewayVoiceStateUpdate } from "discord-api-types/v10";
import { EventEmitter } from "events";
import { Node } from "./Node";
import { Player } from "./Player";
import { Plugin } from "..";
import managerCheck from "../utils/managerCheck";
import { User } from "discord.js";
import { blockedWords } from "../config/blockedWords";
import fs from "fs/promises";
import path from "path";
import Redis, { Redis as RedisClient } from "ioredis";
import {
	LavalinkResponse,
	LavaPlayer,
	ManagerEvents,
	ManagerInitOptions,
	ManagerOptions,
	NodeOptions,
	PlayerOptions,
	PlaylistInfoData,
	PlaylistRawData,
	PlaylistSearchResult,
	SearchQuery,
	SearchResult,
	Track,
	TrackData,
	TrackEndEvent,
	VoicePacket,
	VoiceServer,
	VoiceState,
} from "./Types";
import { AutoPlayPlatform, LoadTypes, ManagerEventTypes, SearchPlatform, StateStorageType, StateTypes, TrackEndReasonTypes, UseNodeOptions } from "./Enums";
import { version } from "../../package.json";

/**
 * The main hub for interacting with Lavalink and using Magmastream.
 */
export class Manager extends EventEmitter {
	/** The map of players. */
	public readonly players = new Collection<string, Player>();
	/** The map of nodes. */
	public readonly nodes = new Collection<string, Node>();
	/** The options that were set. */
	public readonly options: ManagerOptions;
	public initiated = false;
	public redis?: RedisClient;
	private _send: (packet: GatewayVoiceStateUpdate) => unknown;
	private loadedPlugins = new Set<Plugin>();

	/**
	 * Initiates the Manager class.
	 * @param options
	 * @param options.enabledPlugins - An array of enabledPlugins to load.
	 * @param options.nodes - An array of node options to create nodes from.
	 * @param options.playNextOnEnd - Whether to automatically play the first track in the queue when the player is created.
	 * @param options.autoPlaySearchPlatforms - The search platform autoplay will use. Fallback to Youtube if not found.
	 * @param options.enablePriorityMode - Whether to use the priority when selecting a node to play on.
	 * @param options.clientName - The name of the client to send to Lavalink.
	 * @param options.defaultSearchPlatform - The default search platform to use when searching for tracks.
	 * @param options.useNode - The strategy to use when selecting a node to play on.
	 * @param options.trackPartial - The partial track search results to use when searching for tracks. This partials will always be presented on each track.
	 * @param options.eventBatchDuration - The duration to wait before processing the collected player state events.
	 * @param options.eventBatchInterval - The interval to wait before processing the collected player state events.
	 */
	constructor(options: ManagerOptions) {
		super();

		managerCheck(options);

		// Initialize structures
		Structure.get("Player").init(this);
		TrackUtils.init(this);
		PlayerUtils.init(this);

		if (options.trackPartial) {
			TrackUtils.setTrackPartial(options.trackPartial);
			delete options.trackPartial;
		}

		if (options.clientId) this.options.clientId = options.clientId;
		if (options.clusterId) this.options.clusterId = options.clusterId;
		if (options.send && !this._send) this._send = options.send;

		this.options = {
			...options,
			enabledPlugins: options.enabledPlugins ?? [],
			nodes: options.nodes ?? [
				{
					identifier: "Cheap lavalink hosting @",
					host: "https://blackforthosting.com/products?category=lavalink",
					port: 443,
					password: "Try BlackForHosting",
					useSSL: true,
					enableSessionResumeOption: false,
					sessionTimeoutSeconds: 1000,
					nodePriority: 69,
				},
			],
			playNextOnEnd: options.playNextOnEnd ?? true,
			enablePriorityMode: options.enablePriorityMode ?? false,
			clientName: options.clientName ?? `Magmastream/${version}`,
			defaultSearchPlatform: options.defaultSearchPlatform ?? SearchPlatform.YouTube,
			useNode: options.useNode ?? UseNodeOptions.LeastPlayers,
			maxPreviousTracks: options.maxPreviousTracks ?? 20,
			normalizeYouTubeTitles: options.normalizeYouTubeTitles ?? false,
			stateStorage: {
				...options.stateStorage,
				type: options.stateStorage?.type ?? StateStorageType.Memory,
				deleteInactivePlayers: options.stateStorage?.deleteInactivePlayers ?? true,
			},
			autoPlaySearchPlatforms: options.autoPlaySearchPlatforms ?? [AutoPlayPlatform.YouTube],
			send: this._send,
		};

		AutoPlayUtils.init(this);

		if (this.options.nodes) {
			for (const nodeOptions of this.options.nodes) new Node(this, nodeOptions);
		}

		process.on("SIGINT", async () => {
			console.warn("\x1b[33mSIGINT received! Graceful shutdown initiated...\x1b[0m");

			try {
				await this.handleShutdown();
				console.warn("\x1b[32mShutdown complete. Waiting for Node.js event loop to empty...\x1b[0m");

				// Prevent forced exit by Windows
				setTimeout(() => {
					process.exit(0);
				}, 2000);
			} catch (error) {
				console.error(`[MANAGER] Error during shutdown: ${error}`);
				process.exit(1);
			}
		});

		process.on("SIGTERM", async () => {
			console.warn("\x1b[33mSIGTERM received! Graceful shutdown initiated...\x1b[0m");

			try {
				await this.handleShutdown();
				console.warn("\x1b[32mShutdown complete. Exiting now...\x1b[0m");
				process.exit(0);
			} catch (error) {
				console.error(`[MANAGER] Error during SIGTERM shutdown: ${error}`);
				process.exit(1);
			}
		});
	}

	/**
	 * Initiates the Manager.
	 * @param clientId - The Discord client ID (only required when not using any of the magmastream wrappers).
	 * @param clusterId - The cluster ID which runs the current process (required).
	 * @returns The manager instance.
	 */
	public async init(options: ManagerInitOptions = {}): Promise<this> {
		if (this.initiated) {
			return this;
		}

		const { clientId, clusterId = 0 } = options;

		if (clientId !== undefined) {
			if (typeof clientId !== "string" || !/^\d+$/.test(clientId)) {
				throw new Error('"clientId" must be a valid Discord client ID.');
			}
			this.options.clientId = clientId;
		}

		if (typeof clusterId !== "number") {
			console.warn(`[MANAGER] "clusterId" is not a valid number, defaulting to 0.`);
			this.options.clusterId = 0;
		} else {
			this.options.clusterId = clusterId;
		}

		if (this.options.stateStorage.type === StateStorageType.Redis) {
			const config = this.options.stateStorage.redisConfig;

			this.redis = new Redis({
				host: config.host,
				port: Number(config.port),
				password: config.password,
				db: config.db ?? 0,
			});
		}

		for (const node of this.nodes.values()) {
			try {
				await node.connect();
			} catch (err) {
				this.emit(ManagerEventTypes.NodeError, node, err);
			}
		}

		this.loadPlugins();

		this.initiated = true;
		return this;
	}

	/**
	 * Searches the enabled sources based off the URL or the `source` property.
	 * @param query
	 * @param requester
	 * @returns The search result.
	 */
	public async search<T = unknown>(query: string | SearchQuery, requester?: T): Promise<SearchResult> {
		const node = this.useableNode;
		if (!node) throw new Error("No available nodes.");

		const _query: SearchQuery = typeof query === "string" ? { query } : query;
		const _source = _query.source ?? this.options.defaultSearchPlatform;
		let search = /^https?:\/\//.test(_query.query) ? _query.query : `${_source}:${_query.query}`;

		this.emit(ManagerEventTypes.Debug, `[MANAGER] Performing ${_source} search for: ${_query.query}`);

		try {
			const res = (await node.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(search)}`)) as LavalinkResponse;
			if (!res) throw new Error("Query not found.");

			let tracks: Track[] = [];
			let playlist: PlaylistSearchResult["playlist"] = null;

			switch (res.loadType) {
				case LoadTypes.Search:
					tracks = (res.data as TrackData[]).map((track) => TrackUtils.build(track, requester));
					break;

				case LoadTypes.Short:
				case LoadTypes.Track:
					tracks = [TrackUtils.build(res.data as unknown as TrackData, requester)];
					break;

				case LoadTypes.Album:
				case LoadTypes.Artist:
				case LoadTypes.Station:
				case LoadTypes.Podcast:
				case LoadTypes.Show:
				case LoadTypes.Playlist: {
					const playlistData = res.data as PlaylistRawData;
					tracks = playlistData.tracks.map((track) => TrackUtils.build(track, requester));

					playlist = {
						name: playlistData.info.name,
						playlistInfo: playlistData.pluginInfo as PlaylistInfoData[],
						requester: requester as User,
						tracks,
						duration: tracks.reduce((acc, cur) => acc + ((cur as unknown as Track).duration || 0), 0),
					};
					break;
				}
			}

			if (this.options.normalizeYouTubeTitles) {
				const processTrack = (track: Track): Track => {
					if (!/(youtube\.com|youtu\.be)/.test(track.uri)) return track;
					const { cleanTitle, cleanAuthor } = this.parseYouTubeTitle(track.title, track.author);
					track.title = cleanTitle;
					track.author = cleanAuthor;
					return track;
				};

				if (playlist) {
					playlist.tracks = playlist.tracks.map(processTrack);
				} else {
					tracks = tracks.map(processTrack);
				}
			}

			let result: SearchResult;

			switch (res.loadType) {
				case LoadTypes.Album:
				case LoadTypes.Artist:
				case LoadTypes.Station:
				case LoadTypes.Podcast:
				case LoadTypes.Show:
				case LoadTypes.Playlist:
					result = { loadType: res.loadType, tracks, playlist };
					break;
				case LoadTypes.Search:
					result = { loadType: res.loadType, tracks };
					break;

				case LoadTypes.Short:
				case LoadTypes.Track:
					result = { loadType: res.loadType, tracks: [tracks[0]] };
					break;
				default:
					return { loadType: res.loadType };
			}

			this.emit(ManagerEventTypes.Debug, `[MANAGER] Result ${_source} search for: ${_query.query}: ${JSON.stringify(result)}`);

			return result;
		} catch (err) {
			throw new Error(`An error occurred while searching: ${err}`);
		}
	}

	/**
	 * Returns a player or undefined if it does not exist.
	 * @param guildId The guild ID of the player to retrieve.
	 * @returns The player if it exists, undefined otherwise.
	 */
	public getPlayer(guildId: string): Player | undefined {
		return this.players.get(guildId);
	}

	/**
	 * Creates a player or returns one if it already exists.
	 * @param options The options to create the player with.
	 * @returns The created player.
	 */
	public create(options: PlayerOptions): Player {
		if (this.players.has(options.guildId)) {
			return this.players.get(options.guildId);
		}

		// Create a new player with the given options
		this.emit(ManagerEventTypes.Debug, `[MANAGER] Creating new player with options: ${JSON.stringify(options)}`);
		return new (Structure.get("Player"))(options);
	}

	/**
	 * Destroys a player.
	 * @param guildId The guild ID of the player to destroy.
	 * @returns A promise that resolves when the player has been destroyed.
	 */
	public async destroy(guildId: string): Promise<void> {
		this.emit(ManagerEventTypes.Debug, `[MANAGER] Destroying player: ${guildId}`);

		const player = this.getPlayer(guildId);

		if (!player) return;

		await player.destroy();
	}

	/**
	 * Creates a new node or returns an existing one if it already exists.
	 * @param options - The options to create the node with.
	 * @returns The created node.
	 */
	public createNode(options: NodeOptions): Node {
		const key = options.identifier || options.host;

		// Check if the node already exists in the manager's collection
		if (this.nodes.has(key)) {
			// Return the existing node if it does
			return this.nodes.get(key);
		}

		const node = new Node(this, options);
		// Set the node in the manager's collection
		this.nodes.set(key, node);

		// Emit a debug event for node creation
		this.emit(ManagerEventTypes.Debug, `[MANAGER] Creating new node with options: ${JSON.stringify(options)}`);

		// Return the created node
		return node;
	}

	/**
	 * Destroys a node if it exists. Emits a debug event if the node is found and destroyed.
	 * @param identifier - The identifier of the node to destroy.
	 * @returns {void}
	 * @emits {debug} - Emits a debug message indicating the node is being destroyed.
	 */
	public async destroyNode(identifier: string): Promise<void> {
		const node = this.nodes.get(identifier);
		if (!node) {
			this.emit(ManagerEventTypes.Debug, `[MANAGER] Tried to destroy non-existent node: ${identifier}`);
			return;
		}
		this.emit(ManagerEventTypes.Debug, `[MANAGER] Destroying node: ${identifier}`);
		this.nodes.delete(identifier);
		await node.destroy();
	}

	/**
	 * Attaches an event listener to the manager.
	 * @param event The event to listen for.
	 * @param listener The function to call when the event is emitted.
	 * @returns The manager instance for chaining.
	 */
	public on<T extends keyof ManagerEvents>(event: T, listener: (...args: ManagerEvents[T]) => void): this {
		return super.on(event, listener);
	}

	/**
	 * Updates the voice state of a player based on the provided data.
	 * @param data - The data containing voice state information, which can be a VoicePacket, VoiceServer, or VoiceState.
	 * @returns A promise that resolves when the voice state update is handled.
	 * @emits {debug} - Emits a debug message indicating the voice state is being updated.
	 */
	public async updateVoiceState(data: VoicePacket | VoiceServer | VoiceState): Promise<void> {
		if (!this.isVoiceUpdate(data)) return;

		const update = "d" in data ? data.d : data;
		if (!this.isValidUpdate(update)) return;

		const player = this.getPlayer(update.guild_id);
		if (!player) return;

		this.emit(ManagerEventTypes.Debug, `[MANAGER] Updating voice state: ${JSON.stringify(update)}`);

		if ("token" in update) {
			return await this.handleVoiceServerUpdate(player, update);
		}

		if (update.user_id !== this.options.clientId) return;

		return await this.handleVoiceStateUpdate(player, update);
	}

	/**
	 * Decodes an array of base64 encoded tracks and returns an array of TrackData.
	 * Emits a debug event with the tracks being decoded.
	 * @param tracks - An array of base64 encoded track strings.
	 * @returns A promise that resolves to an array of TrackData objects.
	 * @throws Will throw an error if no nodes are available or if the API request fails.
	 */
	public async decodeTracks(tracks: string[]): Promise<TrackData[]> {
		this.emit(ManagerEventTypes.Debug, `[MANAGER] Decoding tracks: ${JSON.stringify(tracks)}`);
		return new Promise(async (resolve, reject) => {
			const node = this.nodes.first();
			if (!node) throw new Error("No available nodes.");

			const res = (await node.rest.post("/v4/decodetracks", JSON.stringify(tracks)).catch((err) => reject(err))) as TrackData[];

			if (!res) {
				return reject(new Error("No data returned from query."));
			}

			return resolve(res);
		});
	}

	/**
	 * Decodes a base64 encoded track and returns a TrackData.
	 * @param track - The base64 encoded track string.
	 * @returns A promise that resolves to a TrackData object.
	 * @throws Will throw an error if no nodes are available or if the API request fails.
	 */
	public async decodeTrack(track: string): Promise<TrackData> {
		const res = await this.decodeTracks([track]);
		// Since we're only decoding one track, we can just return the first element of the array
		return res[0];
	}

	/**
	 * Saves player states.
	 * @param {string} guildId - The guild ID of the player to save
	 */
	public async savePlayerState(guildId: string): Promise<void> {
		switch (this.options.stateStorage.type) {
			case StateStorageType.Memory:
			case StateStorageType.JSON:
				{
					try {
						const playerStateFilePath = PlayerUtils.getPlayerStatePath(guildId);
						const player = this.getPlayer(guildId);

						if (!player || player.state === StateTypes.Disconnected || !player.voiceChannelId) {
							this.emit(ManagerEventTypes.Debug, `[MANAGER] Skipping save for inactive player: ${guildId}`);
							return;
						}

						const serializedPlayer = await PlayerUtils.serializePlayer(player);

						await fs.mkdir(path.dirname(playerStateFilePath), { recursive: true });
						await fs.writeFile(playerStateFilePath, JSON.stringify(serializedPlayer, null, 2), "utf-8");

						this.emit(ManagerEventTypes.Debug, `[MANAGER] Player state saved: ${guildId}`);
					} catch (error) {
						this.emit(ManagerEventTypes.Debug, `[MANAGER] Error saving player state for guild ${guildId}: ${error}`);
					}
				}
				break;

			case StateStorageType.Redis:
				{
					try {
						const player = this.getPlayer(guildId);

						if (!player || player.state === StateTypes.Disconnected || !player.voiceChannelId) {
							console.warn(`[MANAGER] Skipping save for inactive player: ${guildId}`);
							return;
						}

						const serializedPlayer = await PlayerUtils.serializePlayer(player);
						const redisKey = `${
							this.options.stateStorage.redisConfig.prefix?.endsWith(":")
								? this.options.stateStorage.redisConfig.prefix
								: this.options.stateStorage.redisConfig.prefix ?? "magmastream:"
						}playerstore:${guildId}`;

						await this.redis.set(redisKey, JSON.stringify(serializedPlayer));

						this.emit(ManagerEventTypes.Debug, `[MANAGER] Player state saved to Redis: ${guildId}`);
					} catch (error) {
						this.emit(ManagerEventTypes.Debug, `[MANAGER] Error saving player state to Redis for guild ${guildId}: ${error}`);
					}
				}
				break;
			default:
				return;
		}
	}

	/**
	 * Sleeps for a specified amount of time.
	 * @param ms The amount of time to sleep in milliseconds.
	 * @returns A promise that resolves after the specified amount of time.
	 */
	private async sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Loads player states from the JSON file.
	 * @param nodeId The ID of the node to load player states from.
	 * @returns A promise that resolves when the player states have been loaded.
	 */
	public async loadPlayerStates(nodeId: string): Promise<void> {
		this.emit(ManagerEventTypes.Debug, "[MANAGER] Loading saved players.");
		const node = this.nodes.get(nodeId);
		if (!node) throw new Error(`Could not find node: ${nodeId}`);

		const info = (await node.rest.getAllPlayers()) as LavaPlayer[];

		switch (this.options.stateStorage.type) {
			case StateStorageType.Memory:
			case StateStorageType.JSON:
				{
					const playersBaseDir = PlayerUtils.getPlayersBaseDir();

					try {
						// Ensure base players directory exists
						await fs.access(playersBaseDir).catch(async () => {
							await fs.mkdir(playersBaseDir, { recursive: true });
							this.emit(ManagerEventTypes.Debug, `[MANAGER] Created directory: ${playersBaseDir}`);
						});

						// Read guild directories inside players base dir
						const guildDirs = await fs.readdir(playersBaseDir, { withFileTypes: true });

						for (const dirent of guildDirs) {
							if (!dirent.isDirectory()) continue;

							const guildId = dirent.name;
							const stateFilePath = PlayerUtils.getPlayerStatePath(guildId);

							try {
								await fs.access(stateFilePath);

								const rawData = await fs.readFile(stateFilePath, "utf-8");
								const state = JSON.parse(rawData);

								if (state.clusterId !== this.options.clusterId) continue;
								if (!state.guildId || state.node?.options?.identifier !== nodeId) continue;

								const lavaPlayer = info.find((player) => player.guildId === state.guildId);
								if (!lavaPlayer) {
									await this.destroy(state.guildId);
									continue;
								}

								const playerOptions: PlayerOptions = {
									guildId: state.options.guildId,
									textChannelId: state.options.textChannelId,
									voiceChannelId: state.options.voiceChannelId,
									selfDeafen: state.options.selfDeafen,
									volume: lavaPlayer.volume || state.options.volume,
									nodeIdentifier: nodeId,
								};

								this.emit(ManagerEventTypes.Debug, `[MANAGER] Recreating player: ${state.guildId} from saved file: ${JSON.stringify(state.options)}`);
								const player = this.create(playerOptions);

								await player.node.rest.updatePlayer({
									guildId: state.options.guildId,
									data: {
										voice: {
											token: state.voiceState.event.token,
											endpoint: state.voiceState.event.endpoint,
											sessionId: state.voiceState.sessionId,
										},
									},
								});

								player.connect();

								const tracks: Track[] = [];
								const currentTrack = state.queue.current;
								const queueTracks = state.queue.tracks;

								if (state.isAutoplay) {
									Object.setPrototypeOf(state.data.clientUser, { constructor: { name: "User" } });
									player.setAutoplay(true, state.data.clientUser, state.autoplayTries);
								}

								if (lavaPlayer?.track) {
									tracks.push(...queueTracks);

									if (currentTrack && currentTrack.uri === lavaPlayer.track.info.uri) {
										await player.queue.setCurrent(TrackUtils.build(lavaPlayer.track as TrackData, currentTrack.requester));
									}

									if (tracks.length > 0) {
										await player.queue.clear();
										await player.queue.add(tracks);
									}
								} else {
									if (currentTrack) {
										if (queueTracks.length > 0) {
											tracks.push(...queueTracks);
											await player.queue.clear();
											await player.queue.add(tracks);
										}

										await node.trackEnd(player, currentTrack, {
											reason: TrackEndReasonTypes.Finished,
											type: "TrackEndEvent",
										} as TrackEndEvent);
									} else {
										const previousQueue = await player.queue.getPrevious();
										const lastTrack = previousQueue?.at(-1);

										if (lastTrack) {
											if (queueTracks.length === 0) {
												await node.trackEnd(player, lastTrack, {
													reason: TrackEndReasonTypes.Finished,
													type: "TrackEndEvent",
												} as TrackEndEvent);
											} else {
												tracks.push(...queueTracks);
												if (tracks.length > 0) {
													await player.queue.clear();
													await player.queue.add(tracks);
												}
											}
										} else if (queueTracks.length > 0) {
											tracks.push(...queueTracks);
											if (tracks.length > 0) {
												await player.queue.clear();
												await player.queue.add(tracks);
											}

											await node.trackEnd(player, lastTrack, {
												reason: TrackEndReasonTypes.Finished,
												type: "TrackEndEvent",
											} as TrackEndEvent);
										}
									}
								}

								if (state.queue.previous.length > 0) {
									await player.queue.addPrevious(state.queue.previous);
								} else {
									await player.queue.clearPrevious();
								}

								if (state.paused) {
									await player.pause(true);
								} else {
									player.paused = false;
								}

								if (state.trackRepeat) player.setTrackRepeat(true);
								if (state.queueRepeat) player.setQueueRepeat(true);

								if (state.dynamicRepeat) {
									player.setDynamicRepeat(state.dynamicRepeat, state.dynamicLoopInterval._idleTimeout);
								}

								if (state.data) {
									for (const [name, value] of Object.entries(state.data)) {
										player.set(name, value);
									}
								}

								const filterActions: Record<string, (enabled: boolean) => void> = {
									bassboost: () => player.filters.bassBoost(state.filters.bassBoostlevel),
									distort: (enabled) => player.filters.distort(enabled),
									setDistortion: () => player.filters.setDistortion(state.filters.distortion),
									eightD: (enabled) => player.filters.eightD(enabled),
									setKaraoke: () => player.filters.setKaraoke(state.filters.karaoke),
									nightcore: (enabled) => player.filters.nightcore(enabled),
									slowmo: (enabled) => player.filters.slowmo(enabled),
									soft: (enabled) => player.filters.soft(enabled),
									trebleBass: (enabled) => player.filters.trebleBass(enabled),
									setTimescale: () => player.filters.setTimescale(state.filters.timescale),
									tv: (enabled) => player.filters.tv(enabled),
									vibrato: () => player.filters.setVibrato(state.filters.vibrato),
									vaporwave: (enabled) => player.filters.vaporwave(enabled),
									pop: (enabled) => player.filters.pop(enabled),
									party: (enabled) => player.filters.party(enabled),
									earrape: (enabled) => player.filters.earrape(enabled),
									electronic: (enabled) => player.filters.electronic(enabled),
									radio: (enabled) => player.filters.radio(enabled),
									setRotation: () => player.filters.setRotation(state.filters.rotation),
									tremolo: (enabled) => player.filters.tremolo(enabled),
									china: (enabled) => player.filters.china(enabled),
									chipmunk: (enabled) => player.filters.chipmunk(enabled),
									darthvader: (enabled) => player.filters.darthvader(enabled),
									daycore: (enabled) => player.filters.daycore(enabled),
									doubletime: (enabled) => player.filters.doubletime(enabled),
									demon: (enabled) => player.filters.demon(enabled),
								};

								for (const [filter, isEnabled] of Object.entries(state.filters.filterStatus)) {
									if (isEnabled && filterActions[filter]) {
										filterActions[filter](true);
									}
								}

								this.emit(ManagerEventTypes.PlayerRestored, player, node);
								await this.sleep(1000);
							} catch (error) {
								this.emit(ManagerEventTypes.Debug, `[MANAGER] Error processing player state for guild ${guildId}: ${error}`);
								continue;
							}
						}

						// Cleanup old player state files from guild directories whose nodeId matches
						for (const dirent of guildDirs) {
							if (!dirent.isDirectory()) continue;

							const guildId = dirent.name;
							const stateFilePath = PlayerUtils.getPlayerStatePath(guildId);

							try {
								await fs.access(stateFilePath);
								const data = await fs.readFile(stateFilePath, "utf-8");
								const state = JSON.parse(data);

								if (state && typeof state === "object" && state.node?.options?.identifier === nodeId) {
									// Remove the entire guild directory or just the state file depending on your cleanup strategy
									await fs.rm(PlayerUtils.getGuildDir(guildId), { recursive: true, force: true });
									this.emit(ManagerEventTypes.Debug, `[MANAGER] Deleted player state folder for guild ${guildId}`);
								}
							} catch (error) {
								this.emit(ManagerEventTypes.Debug, `[MANAGER] Error deleting player state for guild ${guildId}: ${error}`);
								continue;
							}
						}
					} catch (error) {
						this.emit(ManagerEventTypes.Debug, `[MANAGER] Error loading player states: ${error}`);
					}
				}
				break;
			case StateStorageType.Redis:
				{
					try {
						// Get all keys matching our pattern
						const redisKeyPattern = `${
							this.options.stateStorage.redisConfig.prefix?.endsWith(":")
								? this.options.stateStorage.redisConfig.prefix
								: this.options.stateStorage.redisConfig.prefix ?? "magmastream:"
						}playerstore:*`;
						const keys = await this.redis.keys(redisKeyPattern);

						for (const key of keys) {
							try {
								const data = await this.redis.get(key);
								if (!data) continue;

								const state = JSON.parse(data);
								if (!state || typeof state !== "object" || state.clusterId !== this.options.clusterId) continue;

								const guildId = key.split(":").pop();
								if (!guildId) continue;

								if (state.node?.options?.identifier === nodeId) {
									const lavaPlayer = info.find((player) => player.guildId === guildId);
									if (!lavaPlayer) {
										await this.destroy(guildId);
									}

									const playerOptions: PlayerOptions = {
										guildId: state.options.guildId,
										textChannelId: state.options.textChannelId,
										voiceChannelId: state.options.voiceChannelId,
										selfDeafen: state.options.selfDeafen,
										volume: lavaPlayer?.volume || state.options.volume,
										nodeIdentifier: nodeId,
									};

									this.emit(ManagerEventTypes.Debug, `[MANAGER] Recreating player: ${guildId} from Redis`);
									const player = this.create(playerOptions);

									await player.node.rest.updatePlayer({
										guildId: state.options.guildId,
										data: { voice: { token: state.voiceState.event.token, endpoint: state.voiceState.event.endpoint, sessionId: state.voiceState.sessionId } },
									});

									player.connect();

									// Rest of the player state restoration code (tracks, filters, etc.)
									const tracks: Track[] = [];

									const currentTrack = state.queue.current;
									const queueTracks = state.queue.tracks;

									if (state.isAutoplay) {
										Object.setPrototypeOf(state.data.clientUser, { constructor: { name: "User" } });
										player.setAutoplay(true, state.data.clientUser, state.autoplayTries);
									}

									if (lavaPlayer?.track) {
										// If lavaPlayer has a track, push all queue tracks
										tracks.push(...queueTracks);

										// Set current track if matches lavaPlayer's track URI
										if (currentTrack && currentTrack.uri === lavaPlayer.track.info.uri) {
											await player.queue.setCurrent(TrackUtils.build(lavaPlayer.track as TrackData, currentTrack.requester));
										}

										// Add tracks to queue
										if (tracks.length > 0) {
											await player.queue.clear();
											await player.queue.add(tracks);
										}
									} else {
										// LavaPlayer missing track or lavaPlayer is falsy
										if (currentTrack) {
											if (queueTracks.length > 0) {
												tracks.push(...queueTracks);
												await player.queue.clear();
												await player.queue.add(tracks);
											}

											await node.trackEnd(player, currentTrack, {
												reason: TrackEndReasonTypes.Finished,
												type: "TrackEndEvent",
											} as TrackEndEvent);
										} else {
											// No current track, check previous queue for last track
											const previousQueue = await player.queue.getPrevious();
											const lastTrack = previousQueue?.at(-1);

											if (lastTrack) {
												if (queueTracks.length === 0) {
													// If no tracks in queue, end last track
													await node.trackEnd(player, lastTrack, {
														reason: TrackEndReasonTypes.Finished,
														type: "TrackEndEvent",
													} as TrackEndEvent);
												} else {
													// If there are queued tracks, add them
													tracks.push(...queueTracks);

													if (tracks.length > 0) {
														await player.queue.clear();
														await player.queue.add(tracks);
													}
												}
											} else {
												if (queueTracks.length > 0) {
													tracks.push(...queueTracks);
													if (tracks.length > 0) {
														await player.queue.clear();
														await player.queue.add(tracks);
													}

													await node.trackEnd(player, lastTrack, {
														reason: TrackEndReasonTypes.Finished,
														type: "TrackEndEvent",
													} as TrackEndEvent);
												}
											}
										}
									}

									if (state.queue.previous.length > 0) {
										await player.queue.addPrevious(state.queue.previous);
									} else {
										await player.queue.clearPrevious();
									}

									if (state.paused) {
										await player.pause(true);
									} else {
										player.paused = false;
									}

									if (state.trackRepeat) player.setTrackRepeat(true);
									if (state.queueRepeat) player.setQueueRepeat(true);

									if (state.dynamicRepeat) {
										player.setDynamicRepeat(state.dynamicRepeat, state.dynamicLoopInterval._idleTimeout);
									}
									if (state.data) {
										for (const [name, value] of Object.entries(state.data)) {
											player.set(name, value);
										}
									}

									const filterActions: Record<string, (enabled: boolean) => void> = {
										bassboost: () => player.filters.bassBoost(state.filters.bassBoostlevel),
										distort: (enabled) => player.filters.distort(enabled),
										setDistortion: () => player.filters.setDistortion(state.filters.distortion),
										eightD: (enabled) => player.filters.eightD(enabled),
										setKaraoke: () => player.filters.setKaraoke(state.filters.karaoke),
										nightcore: (enabled) => player.filters.nightcore(enabled),
										slowmo: (enabled) => player.filters.slowmo(enabled),
										soft: (enabled) => player.filters.soft(enabled),
										trebleBass: (enabled) => player.filters.trebleBass(enabled),
										setTimescale: () => player.filters.setTimescale(state.filters.timescale),
										tv: (enabled) => player.filters.tv(enabled),
										vibrato: () => player.filters.setVibrato(state.filters.vibrato),
										vaporwave: (enabled) => player.filters.vaporwave(enabled),
										pop: (enabled) => player.filters.pop(enabled),
										party: (enabled) => player.filters.party(enabled),
										earrape: (enabled) => player.filters.earrape(enabled),
										electronic: (enabled) => player.filters.electronic(enabled),
										radio: (enabled) => player.filters.radio(enabled),
										setRotation: () => player.filters.setRotation(state.filters.rotation),
										tremolo: (enabled) => player.filters.tremolo(enabled),
										china: (enabled) => player.filters.china(enabled),
										chipmunk: (enabled) => player.filters.chipmunk(enabled),
										darthvader: (enabled) => player.filters.darthvader(enabled),
										daycore: (enabled) => player.filters.daycore(enabled),
										doubletime: (enabled) => player.filters.doubletime(enabled),
										demon: (enabled) => player.filters.demon(enabled),
									};

									// Iterate through filterStatus and apply the enabled filters
									for (const [filter, isEnabled] of Object.entries(state.filters.filterStatus)) {
										if (isEnabled && filterActions[filter]) {
											filterActions[filter](true);
										}
									}

									// After processing, delete the Redis key
									await this.redis.del(key);

									this.emit(ManagerEventTypes.Debug, `[MANAGER] Deleted player state from Redis: ${key}`);

									this.emit(ManagerEventTypes.PlayerRestored, player, node);
									await this.sleep(1000);
								}
							} catch (error) {
								this.emit(ManagerEventTypes.Debug, `[MANAGER] Error processing Redis key ${key}: ${error}`);
								continue;
							}
						}
					} catch (error) {
						this.emit(ManagerEventTypes.Debug, `[MANAGER] Error loading player states from Redis: ${error}`);
					}
				}
				break;
			default:
				break;
		}

		this.emit(ManagerEventTypes.Debug, "[MANAGER] Finished loading saved players.");
		this.emit(ManagerEventTypes.RestoreComplete, node);
	}

	/**
	 * Returns the node to use based on the configured `useNode` and `enablePriorityMode` options.
	 * If `enablePriorityMode` is true, the node is chosen based on priority, otherwise it is chosen based on the `useNode` option.
	 * If `useNode` is "leastLoad", the node with the lowest load is chosen, if it is "leastPlayers", the node with the fewest players is chosen.
	 * If `enablePriorityMode` is false and `useNode` is not set, the node with the lowest load is chosen.
	 * @returns {Node} The node to use.
	 */
	public get useableNode(): Node {
		return this.options.enablePriorityMode
			? this.priorityNode
			: this.options.useNode === UseNodeOptions.LeastLoad
			? this.leastLoadNode.first()
			: this.leastPlayersNode.first();
	}

	/**
	 * Handles the shutdown of the process by saving all active players' states and optionally cleaning up inactive players.
	 * This function is called when the process is about to exit.
	 * It iterates through all players and calls {@link savePlayerState} to save their states.
	 * Optionally, it also calls {@link cleanupInactivePlayers} to remove any stale player state files.
	 * After saving and cleaning up, it exits the process.
	 */
	public async handleShutdown(): Promise<void> {
		this.unloadPlugins();
		console.warn("\x1b[31m%s\x1b[0m", "MAGMASTREAM WARNING: Shutting down! Please wait, saving active players...");

		try {
			await this.clearAllStoredPlayers();
			const savePromises = Array.from(this.players.keys()).map(async (guildId) => {
				try {
					await this.savePlayerState(guildId);
				} catch (error) {
					console.error(`[MANAGER] Error saving player state for guild ${guildId}:`, error);
				}
			});

			if (this.options.stateStorage.deleteInactivePlayers) await this.cleanupInactivePlayers();
			await Promise.allSettled(savePromises);

			setTimeout(() => {
				console.warn("\x1b[32m%s\x1b[0m", "MAGMASTREAM INFO: Shutting down complete, exiting...");
				process.exit(0);
			}, 500);
		} catch (error) {
			console.error(`[MANAGER] Unexpected error during shutdown:`, error);
			process.exit(1);
		}
	}

	/**
	 * Parses a YouTube title into a clean title and author.
	 * @param title - The original title of the YouTube video.
	 * @param originalAuthor - The original author of the YouTube video.
	 * @returns An object with the clean title and author.
	 */
	private parseYouTubeTitle(title: string, originalAuthor: string): { cleanTitle: string; cleanAuthor: string } {
		// Remove "- Topic" from author and "Topic -" from title
		const cleanAuthor = originalAuthor.replace("- Topic", "").trim();
		title = title.replace("Topic -", "").trim();

		// Remove blocked words and phrases
		const escapedBlockedWords = blockedWords.map((word) => this.escapeRegExp(word));
		const blockedWordsPattern = new RegExp(`\\b(${escapedBlockedWords.join("|")})\\b`, "gi");
		title = title.replace(blockedWordsPattern, "").trim();

		// Remove empty brackets and balance remaining brackets
		title = title
			.replace(/[([{]\s*[)\]}]/g, "") // Empty brackets
			.replace(/^[^\w\d]*|[^\w\d]*$/g, "") // Leading/trailing non-word characters
			.replace(/\s{2,}/g, " ") // Multiple spaces
			.trim();

		// Remove '@' symbol before usernames
		title = title.replace(/@(\w+)/g, "$1");

		// Balance remaining brackets
		title = this.balanceBrackets(title);

		// Check if the title contains a hyphen, indicating potential "Artist - Title" format
		if (title.includes(" - ")) {
			const [artist, songTitle] = title.split(" - ").map((part) => part.trim());

			// If the artist part matches or is included in the clean author, use the clean author
			if (artist.toLowerCase() === cleanAuthor.toLowerCase() || cleanAuthor.toLowerCase().includes(artist.toLowerCase())) {
				return { cleanAuthor, cleanTitle: songTitle };
			}

			// If the artist is different, keep both parts
			return { cleanAuthor: artist, cleanTitle: songTitle };
		}

		// If no clear artist-title separation, return clean author and cleaned title
		return { cleanAuthor, cleanTitle: title };
	}

	/**
	 * Balances brackets in a given string by ensuring all opened brackets are closed correctly.
	 * @param str - The input string that may contain unbalanced brackets.
	 * @returns A new string with balanced brackets.
	 */
	private balanceBrackets(str: string): string {
		const stack: string[] = [];
		const openBrackets = "([{";
		const closeBrackets = ")]}";
		let result = "";

		// Iterate over each character in the string
		for (const char of str) {
			// If the character is an open bracket, push it onto the stack and add to result
			if (openBrackets.includes(char)) {
				stack.push(char);
				result += char;
			}
			// If the character is a close bracket, check if it balances with the last open bracket
			else if (closeBrackets.includes(char)) {
				if (stack.length > 0 && openBrackets.indexOf(stack[stack.length - 1]) === closeBrackets.indexOf(char)) {
					stack.pop();
					result += char;
				}
			}
			// If it's neither, just add the character to the result
			else {
				result += char;
			}
		}

		// Close any remaining open brackets by adding the corresponding close brackets
		while (stack.length > 0) {
			const lastOpen = stack.pop()!;
			result += closeBrackets[openBrackets.indexOf(lastOpen)];
		}

		return result;
	}

	/**
	 * Escapes a string by replacing special regex characters with their escaped counterparts.
	 * @param string - The string to escape.
	 * @returns The escaped string.
	 */
	private escapeRegExp(string: string): string {
		// Replace special regex characters with their escaped counterparts
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	/**
	 * Checks if the given data is a voice update.
	 * @param data The data to check.
	 * @returns Whether the data is a voice update.
	 */
	private isVoiceUpdate(data: VoicePacket | VoiceServer | VoiceState): boolean {
		return "t" in data && ["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(data.t);
	}

	/**
	 * Determines if the provided update is a valid voice update.
	 * A valid update must contain either a token or a session_id.
	 *
	 * @param update - The voice update data to validate, which can be a VoicePacket, VoiceServer, or VoiceState.
	 * @returns {boolean} - True if the update is valid, otherwise false.
	 */
	private isValidUpdate(update: VoicePacket | VoiceServer | VoiceState): boolean {
		return update && ("token" in update || "session_id" in update);
	}

	/**
	 * Handles a voice server update by updating the player's voice state and sending the voice state to the Lavalink node.
	 * @param player The player for which the voice state is being updated.
	 * @param update The voice server data received from Discord.
	 * @returns A promise that resolves when the voice state update is handled.
	 * @emits {debug} - Emits a debug message indicating the voice state is being updated.
	 */
	private async handleVoiceServerUpdate(player: Player, update: VoiceServer): Promise<void> {
		player.voiceState.event = update;

		const {
			sessionId,
			event: { token, endpoint },
		} = player.voiceState;

		await player.node.rest.updatePlayer({
			guildId: player.guildId,
			data: { voice: { token, endpoint, sessionId } },
		});

		this.emit(
			ManagerEventTypes.Debug,
			`Updated voice server for player ${player.guildId} with token ${token} and endpoint ${endpoint} and sessionId ${sessionId}`
		);
		return;
	}

	/**
	 * Handles a voice state update by updating the player's voice channel and session ID if provided, or by disconnecting and destroying the player if the channel ID is null.
	 * @param player The player for which the voice state is being updated.
	 * @param update The voice state data received from Discord.
	 * @emits {playerMove} - Emits a player move event if the channel ID is provided and the player is currently connected to a different voice channel.
	 * @emits {playerDisconnect} - Emits a player disconnect event if the channel ID is null.
	 */
	private async handleVoiceStateUpdate(player: Player, update: VoiceState): Promise<void> {
		this.emit(
			ManagerEventTypes.Debug,
			`Updated voice state for player ${player.guildId} with channel id ${update.channel_id} and session id ${update.session_id}`
		);
		if (update.channel_id) {
			if (player.voiceChannelId !== update.channel_id) {
				this.emit(ManagerEventTypes.PlayerMove, player, player.voiceChannelId, update.channel_id);
			}

			player.voiceState.sessionId = update.session_id;
			player.voiceChannelId = update.channel_id;
			return;
		}

		this.emit(ManagerEventTypes.PlayerDisconnect, player, player.voiceChannelId);

		player.voiceChannelId = null;
		player.voiceState = Object.assign({});
		await player.pause(true);
		return;
	}

	/**
	 * Cleans up inactive players by removing their state files from the file system.
	 * This is done to prevent stale state files from accumulating on the file system.
	 */
	public async cleanupInactivePlayers(): Promise<void> {
		switch (this.options.stateStorage.type) {
			case StateStorageType.JSON:
				{
					const playersBaseDir = PlayerUtils.getPlayersBaseDir();

					try {
						await fs.mkdir(playersBaseDir, { recursive: true });

						const activeGuildIds = new Set(this.players.keys());

						// Cleanup inactive guild directories inside playersBaseDir
						const guildDirs = await fs.readdir(playersBaseDir, { withFileTypes: true });
						for (const dirent of guildDirs) {
							if (!dirent.isDirectory()) continue;

							const guildId = dirent.name;
							if (!activeGuildIds.has(guildId)) {
								const guildPath = PlayerUtils.getGuildDir(guildId);
								await fs.rm(guildPath, { recursive: true, force: true });
								this.emit(ManagerEventTypes.Debug, `[MANAGER] Deleted inactive player data folder: ${guildId}`);
							}
						}
					} catch (error) {
						this.emit(ManagerEventTypes.Debug, `[MANAGER] Error cleaning up inactive JSON players: ${error}`);
					}
					return;
				}
				break;

			case StateStorageType.Redis:
				{
					const prefix = this.options.stateStorage.redisConfig.prefix?.endsWith(":")
						? this.options.stateStorage.redisConfig.prefix
						: this.options.stateStorage.redisConfig.prefix ?? "magmastream:";

					const pattern = `${prefix}queue:*:current`;

					const stream = this.redis.scanStream({
						match: pattern,
						count: 100,
					});

					for await (const keys of stream) {
						for (const key of keys) {
							// Extract guildId from queue key
							const match = key.match(new RegExp(`^${prefix}queue:(.+):current$`));
							if (!match) continue;

							const guildId = match[1];

							// If player is not active in memory, clean up all keys
							if (!this.players.has(guildId)) {
								await this.redis.del(
									`${prefix}playerstore:${guildId}`,
									`${prefix}queue:${guildId}:current`,
									`${prefix}queue:${guildId}:tracks`,
									`${prefix}queue:${guildId}:previous`
								);

								this.emit(ManagerEventTypes.Debug, `[MANAGER] Cleaned inactive Redis player data: ${guildId}`);
							}
						}
					}
					return;
				}
				break;
			default:
				break;
		}
	}

	/**
	 * Cleans up an inactive player by removing its state data.
	 * This is done to prevent stale state data from accumulating.
	 * @param guildId The guild ID of the player to clean up.
	 */
	public async cleanupInactivePlayer(guildId: string): Promise<void> {
		switch (this.options.stateStorage.type) {
			case StateStorageType.JSON:
				{
					try {
						if (!this.players.has(guildId)) {
							const guildDir = PlayerUtils.getGuildDir(guildId);
							await fs.rm(guildDir, { recursive: true, force: true });

							this.emit(ManagerEventTypes.Debug, `[MANAGER] Deleted inactive player data folder: ${guildId}`);
						}
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
							this.emit(ManagerEventTypes.Debug, `[MANAGER] Error deleting player files for ${guildId}: ${error}`);
						}
					}
				}
				break;
			case StateStorageType.Redis:
				{
					const player = this.getPlayer(guildId);

					if (!player) {
						const prefix = this.options.stateStorage.redisConfig.prefix?.endsWith(":")
							? this.options.stateStorage.redisConfig.prefix
							: `${this.options.stateStorage.redisConfig.prefix ?? "magmastream"}:`;

						const keysToDelete = [
							`${prefix}playerstore:${guildId}`,
							`${prefix}queue:${guildId}:tracks`,
							`${prefix}queue:${guildId}:current`,
							`${prefix}queue:${guildId}:previous`,
						];

						await this.redis.del(...keysToDelete);
						this.emit(ManagerEventTypes.Debug, `[MANAGER] Deleted Redis player and queue data for: ${guildId}`);
					}
				}
				break;
			default:
				break;
		}
	}

	/**
	 * Loads the enabled plugins.
	 */
	private loadPlugins(): void {
		if (!Array.isArray(this.options.enabledPlugins)) return;

		for (const [index, plugin] of this.options.enabledPlugins.entries()) {
			if (!(plugin instanceof Plugin)) {
				throw new RangeError(`Plugin at index ${index} does not extend Plugin.`);
			}

			try {
				plugin.load(this);
				this.loadedPlugins.add(plugin);
				this.emit(ManagerEventTypes.Debug, `[PLUGIN] Loaded plugin: ${plugin.name}`);
			} catch (err) {
				this.emit(ManagerEventTypes.Debug, `[PLUGIN] Failed to load plugin "${plugin.name}": ${err}`);
			}
		}
	}

	/**
	 * Unloads the enabled plugins.
	 */
	private unloadPlugins(): void {
		for (const plugin of this.loadedPlugins) {
			try {
				plugin.unload(this);
				this.emit(ManagerEventTypes.Debug, `[PLUGIN] Unloaded plugin: ${plugin.name}`);
			} catch (err) {
				this.emit(ManagerEventTypes.Debug, `[PLUGIN] Failed to unload plugin "${plugin.name}": ${err}`);
			}
		}
		this.loadedPlugins.clear();
	}

	/**
	 * Clears all player states from the file system.
	 * This is done to prevent stale state files from accumulating on the file system.
	 */
	private async clearAllStoredPlayers(): Promise<void> {
		switch (this.options.stateStorage.type) {
			case StateStorageType.Memory:
			case StateStorageType.JSON: {
				const playersBaseDir = PlayerUtils.getPlayersBaseDir();

				try {
					await fs.access(playersBaseDir).catch(async () => {
						await fs.mkdir(playersBaseDir, { recursive: true });
						this.emit(ManagerEventTypes.Debug, `[MANAGER] Created directory: ${playersBaseDir}`);
					});

					const files = await fs.readdir(playersBaseDir);
					await Promise.all(
						files.map((file) =>
							fs.unlink(path.join(playersBaseDir, file)).catch((err) => this.emit(ManagerEventTypes.Debug, `[MANAGER] Failed to delete file ${file}: ${err}`))
						)
					);

					this.emit(ManagerEventTypes.Debug, `[MANAGER] Cleared all player state files in ${playersBaseDir}`);
				} catch (err) {
					this.emit(ManagerEventTypes.Debug, `[MANAGER] Error clearing player state files: ${err}`);
				}
				break;
			}
			case StateStorageType.Redis: {
				const prefix = this.options.stateStorage.redisConfig.prefix?.endsWith(":")
					? this.options.stateStorage.redisConfig.prefix
					: this.options.stateStorage.redisConfig.prefix ?? "magmastream:";

				const patterns = [`${prefix}playerstore:*`, `${prefix}queue:*`];

				try {
					for (const pattern of patterns) {
						const stream = this.redis.scanStream({
							match: pattern,
							count: 100,
						});

						let totalDeleted = 0;

						stream.on("data", async (keys: string[]) => {
							if (keys.length) {
								const pipeline = this.redis.pipeline();
								keys.forEach((key) => pipeline.unlink(key));
								await pipeline.exec();
								totalDeleted += keys.length;
							}
						});

						stream.on("end", () => {
							this.emit(ManagerEventTypes.Debug, `[MANAGER] Cleared ${totalDeleted} Redis keys (pattern: ${pattern})`);
						});

						stream.on("error", (err) => {
							console.error(`[MANAGER] Error during Redis SCAN stream (${pattern}):`, err);
						});
					}
				} catch (err) {
					console.error("[MANAGER] Failed to clear Redis keys:", err);
				}
				break;
			}

			default:
				console.warn("[MANAGER] No valid stateStorage.type set, skipping state clearing.");
		}
	}

	/**
	 * Returns the nodes that has the least load.
	 * The load is calculated by dividing the lavalink load by the number of cores.
	 * The result is multiplied by 100 to get a percentage.
	 * @returns {Collection<string, Node>}
	 */
	private get leastLoadNode(): Collection<string, Node> {
		return this.nodes
			.filter((node) => node.connected && !node.options.isBackup)
			.sort((a, b) => {
				const aload = a.stats.cpu ? (a.stats.cpu.lavalinkLoad / a.stats.cpu.cores) * 100 : 0;
				const bload = b.stats.cpu ? (b.stats.cpu.lavalinkLoad / b.stats.cpu.cores) * 100 : 0;
				// Sort the nodes by their load in ascending order
				return aload - bload;
			});
	}

	/**
	 * Returns the nodes that have the least amount of players.
	 * Filters out disconnected nodes and sorts the remaining nodes
	 * by the number of players in ascending order.
	 * @returns {Collection<string, Node>} A collection of nodes sorted by player count.
	 */
	private get leastPlayersNode(): Collection<string, Node> {
		return this.nodes.filter((node) => node.connected && !node.options.isBackup).sort((a, b) => a.stats.players - b.stats.players);
	}

	/**
	 * Returns a node based on priority.
	 * The nodes are sorted by priority in descending order, and then a random number
	 * between 0 and 1 is generated. The node that has a cumulative weight greater than or equal to the
	 * random number is returned.
	 * If no node has a cumulative weight greater than or equal to the random number, the node with the
	 * lowest load is returned.
	 * @returns {Node} The node to use.
	 */
	private get priorityNode(): Node {
		// Filter out nodes that are not connected or have a priority of 0
		const filteredNodes = this.nodes.filter((node) => node.connected && node.options.nodePriority > 0);
		// Calculate the total weight
		const totalWeight = filteredNodes.reduce((total, node) => total + node.options.nodePriority, 0);
		// Map the nodes to their weights
		const weightedNodes = filteredNodes.map((node) => ({
			node,
			weight: node.options.nodePriority / totalWeight,
		}));
		// Generate a random number between 0 and 1
		const randomNumber = Math.random();

		// Initialize the cumulative weight to 0
		let cumulativeWeight = 0;

		// Loop through the weighted nodes and find the first node that has a cumulative weight greater than or equal to the random number
		for (const { node, weight } of weightedNodes) {
			cumulativeWeight += weight;
			if (randomNumber <= cumulativeWeight) {
				return node;
			}
		}

		// If no node has a cumulative weight greater than or equal to the random number, return the node with the lowest load
		return this.options.useNode === UseNodeOptions.LeastLoad ? this.leastLoadNode.first() : this.leastPlayersNode.first();
	}

	protected send(packet: GatewayVoiceStateUpdate): unknown {
		if (!this._send) {
			console.warn("[Manager.send] _send is not defined! Packet will not be sent.");
			return;
		}
		return this._send(packet);
	}

	public sendPacket(packet: GatewayVoiceStateUpdate): unknown {
		return this.send(packet);
	}
}
