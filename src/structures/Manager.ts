import {
	LoadTypes,
	Plugin,
	SponsorBlockChaptersLoaded,
	SponsorBlockChapterStarted,
	SponsorBlockSegmentSkipped,
	SponsorBlockSegmentsLoaded,
	StateTypes,
	Structure,
	TrackData,
	TrackEndEvent,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	TrackUtils,
	VoicePacket,
	VoiceServer,
	WebSocketClosedEvent,
} from "./Utils";
import { Collection } from "@discordjs/collection";
import { EventEmitter } from "events";
import { Node, NodeOptions } from "./Node";
import { Player, PlayerOptions, Track } from "./Player";
import { VoiceState } from "..";
import managerCheck from "../utils/managerCheck";
import { ClientUser, User } from "discord.js";
import { blockedWords } from "../config/blockedWords";
import fs from "fs";
import path from "path";

/**
 * The main hub for interacting with Lavalink and using Magmastream,
 */
export class Manager extends EventEmitter {
	/**
	 * Attaches an event listener to the manager.
	 * @param event The event to listen for.
	 * @param listener The function to call when the event is emitted.
	 * @returns The manager instance for chaining.
	 */
	public on<T extends keyof ManagerEvents>(event: T, listener: (...args: ManagerEvents[T]) => void): this {
		return super.on(event, listener);
	}

	/** The map of players. */
	public readonly players = new Collection<string, Player>();
	/** The map of nodes. */
	public readonly nodes = new Collection<string, Node>();
	/** The options that were set. */
	public readonly options: ManagerOptions;
	private initiated = false;

	/**
	 * Loads player states from the JSON file.
	 * @param nodeId The ID of the node to load player states from.
	 * @returns A promise that resolves when the player states have been loaded.
	 */
	public async loadPlayerStates(nodeId: string): Promise<void> {
		// Changed to async and added Promise<void>
		this.emit("debug", "[MANAGER] Loading saved players.");
		const node = this.nodes.get(nodeId);
		if (!node) throw new Error(`Could not find node: ${nodeId}`);

		const info = (await node.rest.getAllPlayers()) as LavaPlayer[];

		const playerStatesDir = path.join(process.cwd(), "magmastream", "dist", "sessionData", "players");

		if (!fs.existsSync(playerStatesDir)) {
			fs.mkdirSync(playerStatesDir, { recursive: true });
		}

		const playerFiles = fs.readdirSync(playerStatesDir);

		/**
		 * Converts a track from the Lavalink format to the Magmastream format.
		 * @param song The track in the Lavalink format.
		 * @returns The track in the Magmastream format.
		 */
		const createTrackData = (song): TrackData => ({
			encoded: song.track,
			info: {
				identifier: song.identifier,
				isSeekable: song.isSeekable,
				author: song.author,
				length: song.duration,
				isrc: song.isrc,
				isStream: song.isStream,
				title: song.title,
				uri: song.uri,
				artworkUrl: song.artworkUrl,
				sourceName: song.sourceName,
			},
			pluginInfo: song.pluginInfo,
		});

		for (const file of playerFiles) {
			const filePath = path.join(playerStatesDir, file);

			if (!fs.existsSync(filePath)) {
				continue;
			}

			const data = fs.readFileSync(filePath, "utf-8");
			const state = JSON.parse(data);

			if (state && typeof state === "object" && state.guildId && state.node.options.identifier === nodeId) {
				const lavaPlayer = info.find((player) => player.guildId === state.guildId);
				if (!lavaPlayer) {
					this.destroy(state.guildId);
					continue;
				}
				const playerOptions: PlayerOptions = {
					guildId: state.options.guildId,
					textChannelId: state.options.textChannelId,
					voiceChannelId: state.options.voiceChannelId,
					selfDeafen: state.options.selfDeafen,
					volume: lavaPlayer.volume || state.options.volume,
				};

				this.emit("debug", `[MANAGER] Recreating player: ${state.guildId} from saved file: ${JSON.stringify(state.options)}`);
				const player = this.create(playerOptions);

				if (!lavaPlayer.state.connected) {
					player.connect();
				}

				const tracks = [];

				if (!lavaPlayer.track) {
					if (state.queue.current !== null) {
						for (const key in state.queue) {
							if (!isNaN(Number(key)) && key !== "current" && key !== "previous" && key !== "manager") {
								const song = state.queue[key];
								tracks.push(song, song.requester);
							}
						}

						if (tracks.length > 0) {
							player.queue.add(tracks);
							if (!state.paused && lavaPlayer.state.connected) player.play();
						} else {
							const payload = {
								reason: "finished",
							};
							node.queueEnd(player, state.queue.current, payload as TrackEndEvent);
						}
					} else {
						if (state.queue.previous !== null) {
							const payload = {
								reason: "finished",
							};
							node.queueEnd(player, state.queue.previous, payload as TrackEndEvent);
						} else {
							this.destroy(state.guildId);
							continue;
						}
					}
				} else {
					const currentTrack = state.queue.current;
					tracks.push(TrackUtils.build(createTrackData(currentTrack), currentTrack.requester));

					for (const key in state.queue) {
						if (!isNaN(Number(key)) && key !== "current" && key !== "previous" && key !== "manager") {
							const song = state.queue[key];
							tracks.push(song, song.requester);
						}
					}
					player.queue.add(tracks);
				}

				if (state.paused) player.pause(true);
				player.setTrackRepeat(state.trackRepeat);
				player.setQueueRepeat(state.queueRepeat);
				if (state.dynamicRepeat) {
					player.setDynamicRepeat(state.dynamicRepeat, state.dynamicLoopInterval._idleTimeout);
				}
				if (state.isAutoplay && state?.data?.Internal_BotUser) {
					player.setAutoplay(state.isAutoplay, state.data.Internal_BotUser as User | ClientUser);
				}

				// Delete the file after the player is successfully loaded
				fs.unlinkSync(filePath);
				this.emit("debug", `[MANAGER] Deleted player state file after loading: ${filePath}`);
			}
		}
		this.emit("debug", "[MANAGER] Finished loading saved players.");
	}

	/**
	 * Gets each player's JSON file
	 * @param {string} guildId - The guild ID
	 * @returns {string} The path to the player's JSON file
	 */
	private getPlayerFilePath(guildId: string): string {
		// Get the directory path to where the player's JSON file will be saved
		const configDir = path.join(process.cwd(), "magmastream", "dist", "sessionData", "players");

		// Make sure the directory exists, create it if it doesn't
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}

		// Generate the full path to the player's JSON file
		return path.join(configDir, `${guildId}.json`);
	}

	/**
	 * Saves player states to the JSON file.
	 * @param {string} guildId - The guild ID of the player to save
	 */
	public savePlayerState(guildId: string): void {
		// Get the full path to the player's JSON file
		const playerStateFilePath = this.getPlayerFilePath(guildId);

		// Get the player instance from the manager's collection
		const player = this.players.get(guildId);

		// If the player does not exist or is disconnected, or the voice channel is not specified, do not save the player state
		if (!player || player.state === StateTypes.Disconnected || !player.voiceChannelId) {
			// Clean up any inactive players
			return this.cleanupInactivePlayers();
		}

		// Serialize the player instance to avoid circular references
		const serializedPlayer = this.serializePlayer(player) as unknown as Player;

		// Write the serialized player state to the JSON file
		fs.writeFileSync(playerStateFilePath, JSON.stringify(serializedPlayer, null, 2), "utf-8");

		// Emit a debug event to indicate the player state has been saved
		this.emit("debug", `[MANAGER] Saving player: ${guildId} at location: ${playerStateFilePath}`);
	}

	/**
	 * Serializes a Player instance to avoid circular references.
	 * @param player The Player instance to serialize
	 * @returns The serialized Player instance
	 */
	private serializePlayer(player: Player): Record<string, unknown> {
		const seen = new WeakSet();

		/**
		 * Recursively serializes an object, avoiding circular references.
		 * @param obj The object to serialize
		 * @returns The serialized object
		 */
		const serialize = (obj: unknown): unknown => {
			if (obj && typeof obj === "object") {
				if (seen.has(obj)) return;

				seen.add(obj);
			}
			return obj;
		};

		return JSON.parse(
			JSON.stringify(player, (key, value) => {
				if (key === "filters" || key === "manager") {
					return null;
				}

				if (key === "queue") {
					return {
						...value,
						current: value.current || null,
					};
				}

				return serialize(value);
			})
		);
	}

	/**
	 * Checks for players that are no longer active and deletes their saved state files.
	 * This is done to prevent stale state files from accumulating on the file system.
	 */
	private cleanupInactivePlayers(): void {
		const playerStatesDir = path.join(process.cwd(), "magmastream", "dist", "sessionData", "players");

		// Create the directory if it does not exist
		if (!fs.existsSync(playerStatesDir)) {
			fs.mkdirSync(playerStatesDir, { recursive: true });
		}

		// Get the list of player state files
		const playerFiles = fs.readdirSync(playerStatesDir);

		// Get the set of active guild IDs from the manager's player collection
		const activeGuildIds = new Set(this.players.keys());

		// Iterate over the player state files
		for (const file of playerFiles) {
			// Get the guild ID from the file name
			const guildId = path.basename(file, ".json");

			// If the guild ID is not in the set of active guild IDs, delete the file
			if (!activeGuildIds.has(guildId)) {
				const filePath = path.join(playerStatesDir, file);
				fs.unlinkSync(filePath);
				this.emit("debug", `[MANAGER] Deleting inactive player: ${guildId}`);
			}
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
			.filter((node) => node.connected)
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
		return this.nodes
			.filter((node) => node.connected) // Filter out nodes that are not connected
			.sort((a, b) => a.stats.players - b.stats.players); // Sort by the number of players
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
		const filteredNodes = this.nodes.filter((node) => node.connected && node.options.priority > 0);
		// Calculate the total weight
		const totalWeight = filteredNodes.reduce((total, node) => total + node.options.priority, 0);
		// Map the nodes to their weights
		const weightedNodes = filteredNodes.map((node) => ({
			node,
			weight: node.options.priority / totalWeight,
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

	/**
	 * Returns the node to use based on the configured `useNode` and `usePriority` options.
	 * If `usePriority` is true, the node is chosen based on priority, otherwise it is chosen based on the `useNode` option.
	 * If `useNode` is "leastLoad", the node with the lowest load is chosen, if it is "leastPlayers", the node with the fewest players is chosen.
	 * If `usePriority` is false and `useNode` is not set, the node with the lowest load is chosen.
	 * @returns {Node} The node to use.
	 */
	public get useableNode(): Node {
		return this.options.usePriority
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
	private async handleShutdown(): Promise<void> {
		console.warn("\x1b[31m%s\x1b[0m", "MAGMASTREAM WARNING: Shutting down! Please wait, saving active players...");

		// Create an array of promises for saving player states
		const savePromises = Array.from(this.players.keys()).map((guildId) => {
			return new Promise<void>((resolve) => {
				try {
					this.savePlayerState(guildId);
					resolve(); // Resolve immediately after calling savePlayerState
				} catch (error) {
					console.error(`Error saving player state for guild ${guildId}:`, error);

					throw error;
				}
			});
		});

		// Wait for all save operations to complete and check for errors
		const results = await Promise.allSettled(savePromises);
		const errors = results.filter((result) => result.status === "rejected");

		if (errors.length > 0) {
			console.error("`\x1b[31m%s\x1b[0m", `MAGMASTREAM ERROR: ${errors.length} player states failed to save.`);
		}

		// Clean up inactive players here
		this.cleanupInactivePlayers();

		console.warn("\x1b[32m%s\x1b[0m", "MAGMASTREAM INFO: Shutting down complete, exiting...");

		setTimeout(() => process.exit(errors.length > 0 ? 1 : 0), 100);
	}

	/**
	 * Initiates the Manager class.
	 * @param options
	 * @param options.plugins - An array of plugins to load.
	 * @param options.nodes - An array of node options to create nodes from.
	 * @param options.autoPlay - Whether to automatically play the first track in the queue when the player is created.
	 * @param options.autoPlaySearchPlatform - The search platform autoplay will use. Failback to Youtube if not found.
	 * @param options.usePriority - Whether to use the priority when selecting a node to play on.
	 * @param options.clientName - The name of the client to send to Lavalink.
	 * @param options.defaultSearchPlatform - The default search platform to use when searching for tracks.
	 * @param options.useNode - The strategy to use when selecting a node to play on.
	 * @param options.trackPartial - The partial track search results to use when searching for tracks.
	 * @param options.eventBatchDuration - The duration to wait before processing the collected player state events.
	 * @param options.eventBatchInterval - The interval to wait before processing the collected player state events.
	 */
	constructor(options: ManagerOptions) {
		super();

		process.on("SIGINT", async () => await this.handleShutdown());
		process.on("SIGTERM", async () => await this.handleShutdown());

		managerCheck(options);

		Structure.get("Player").init(this);
		Structure.get("Node").init(this);
		TrackUtils.init(this);

		if (options.trackPartial) {
			TrackUtils.setTrackPartial(options.trackPartial);
			delete options.trackPartial;
		}

		this.options = {
			plugins: [],
			nodes: [
				{
					identifier: "default",
					host: "localhost",
					resumeStatus: false,
					resumeTimeout: 1000,
				},
			],
			autoPlay: true,
			usePriority: false,
			clientName: "Magmastream",
			defaultSearchPlatform: SearchPlatform.YouTube,
			autoPlaySearchPlatform: SearchPlatform.YouTube,
			useNode: UseNodeOptions.LeastPlayers,
			...options,
		};

		if (this.options.plugins) {
			for (const [index, plugin] of this.options.plugins.entries()) {
				if (!(plugin instanceof Plugin)) throw new RangeError(`Plugin at index ${index} does not extend Plugin.`);
				plugin.load(this);
			}
		}

		if (this.options.nodes) {
			for (const nodeOptions of this.options.nodes) new (Structure.get("Node"))(nodeOptions);
		}
	}

	/**
	 * Initiates the Manager.
	 * @param clientId - The Discord client ID (required).
	 * @returns The manager instance.
	 */
	public init(clientId: string): this {
		if (this.initiated) {
			return this;
		}

		// Validate clientId
		if (typeof clientId !== "string" || !/^\d+$/.test(clientId)) {
			throw new Error('"clientId" must be a valid Discord client ID.');
		}

		// Set the validated clientId
		this.options.clientId = clientId;

		// Attempt to connect nodes
		for (const node of this.nodes.values()) {
			try {
				// Connect the node
				node.connect();
			} catch (err) {
				// Handle any errors that occur during the connection process
				this.emit("nodeError", node, err);
			}
		}

		// Set the initiated flag to true
		this.initiated = true;
		return this;
	}

	/**
	 * Searches the enabled sources based off the URL or the `source` property.
	 * @param query
	 * @param requester
	 * @returns The search result.
	 */
	public async search<T = User | ClientUser>(query: string | SearchQuery, requester?: T): Promise<SearchResult> {
		const node = this.useableNode;

		if (!node) {
			throw new Error("No available nodes.");
		}

		const _query: SearchQuery = typeof query === "string" ? { query } : query;
		const _source = _query.source ?? this.options.defaultSearchPlatform;

		let search = _query.query;

		if (!/^https?:\/\//.test(search)) {
			search = `${_source}:${search}`;
		}

		this.emit("debug", `[MANAGER] Performing ${_source} search for: ${_query.query}`);

		try {
			const res = (await node.rest.get(`/v4/loadtracks?identifier=${encodeURIComponent(search)}`)) as LavalinkResponse;

			if (!res) {
				throw new Error("Query not found.");
			}

			let searchData = [];
			let playlistData: PlaylistRawData | undefined;

			switch (res.loadType) {
				case LoadTypes.Search:
					searchData = res.data as TrackData[];
					break;

				case LoadTypes.Track:
					searchData = [res.data as TrackData[]];
					break;

				case LoadTypes.Playlist:
					playlistData = res.data as PlaylistRawData;
					break;
			}

			const tracks = searchData.map((track) => TrackUtils.build(track, requester));
			let playlist = null;

			if (res.loadType === LoadTypes.Playlist) {
				playlist = {
					name: playlistData!.info.name,
					playlistInfo: playlistData.pluginInfo,
					requester: requester,
					tracks: playlistData!.tracks.map((track) => TrackUtils.build(track, requester)),
					duration: playlistData!.tracks.reduce((acc, cur) => acc + (cur.info.length || 0), 0),
				};
			}

			const result: SearchResult = {
				loadType: res.loadType,
				tracks,
				playlist,
			};

			if (this.options.replaceYouTubeCredentials) {
				const replaceCreditsURLs = ["youtube.com", "youtu.be"];

				const processTrack = (track: Track) => {
					if (!replaceCreditsURLs.some((url) => track.uri.includes(url))) return track;

					const { cleanTitle, cleanAuthor } = this.parseYouTubeTitle(track.title, track.author);
					track.title = cleanTitle;
					track.author = cleanAuthor;
					return track;
				};

				if (result.loadType === LoadTypes.Playlist) {
					result.playlist.tracks = result.playlist.tracks.map(processTrack);
				} else {
					result.tracks = result.tracks.map(processTrack);
				}
			}

			this.emit("debug", `[MANAGER] Result ${_source} search for: ${_query.query}: ${JSON.stringify(result)}`);
			return result;
		} catch (err) {
			throw new Error(err);
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
	 * Decodes an array of base64 encoded tracks and returns an array of TrackData.
	 * Emits a debug event with the tracks being decoded.
	 * @param tracks - An array of base64 encoded track strings.
	 * @returns A promise that resolves to an array of TrackData objects.
	 * @throws Will throw an error if no nodes are available or if the API request fails.
	 */
	public decodeTracks(tracks: string[]): Promise<TrackData[]> {
		this.emit("debug", `[MANAGER] Decoding tracks: ${JSON.stringify(tracks)}`);
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
	 * Creates a player or returns one if it already exists.
	 * @param options The options to create the player with.
	 * @returns The created player.
	 */
	public create(options: PlayerOptions): Player {
		if (this.players.has(options.guildId)) {
			return this.players.get(options.guildId);
		}

		// Create a new player with the given options
		this.emit("debug", `[MANAGER] Creating new player with options: ${JSON.stringify(options)}`);
		return new (Structure.get("Player"))(options);
	}

	/**
	 * Returns a player or undefined if it does not exist.
	 * @param guildId The guild ID of the player to retrieve.
	 * @returns The player if it exists, undefined otherwise.
	 */
	public get(guildId: string): Player | undefined {
		return this.players.get(guildId);
	}

	/**
	 * Destroys a player if it exists and cleans up inactive players.
	 * @param guildId - The guild ID of the player to destroy.
	 * @returns {void}
	 * @emits {debug} - Emits a debug message indicating the player is being destroyed.
	 */
	public destroy(guildId: string): void {
		// Emit debug message for player destruction
		this.emit("debug", `[MANAGER] Destroying player: ${guildId}`);

		// Remove the player from the manager's collection
		this.players.delete(guildId);

		// Clean up any inactive players
		this.cleanupInactivePlayers();
	}

	/**
	 * Creates a new node or returns an existing one if it already exists.
	 * @param options - The options to create the node with.
	 * @returns The created node.
	 */
	public createNode(options: NodeOptions): Node {
		// Check if the node already exists in the manager's collection
		if (this.nodes.has(options.identifier || options.host)) {
			// Return the existing node if it does
			return this.nodes.get(options.identifier || options.host);
		}

		// Emit a debug event for node creation
		this.emit("debug", `[MANAGER] Creating new node with options: ${JSON.stringify(options)}`);

		// Create a new node with the given options
		return new (Structure.get("Node"))(options);
	}

	/**
	 * Destroys a node if it exists. Emits a debug event if the node is found and destroyed.
	 * @param identifier - The identifier of the node to destroy.
	 * @returns {void}
	 * @emits {debug} - Emits a debug message indicating the node is being destroyed.
	 */
	public destroyNode(identifier: string): void {
		const node = this.nodes.get(identifier);
		if (!node) return;
		this.emit("debug", `[MANAGER] Destroying node: ${identifier}`);
		node.destroy();
		this.nodes.delete(identifier);
	}

	/**
	 * Sends voice data to the Lavalink server.
	 * @param data
	 */
	public async updateVoiceState(data: VoicePacket | VoiceServer | VoiceState): Promise<void> {
		if ("t" in data && !["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(data.t)) return;

		const update = "d" in data ? data.d : data;

		if (!update || (!("token" in update) && !("session_id" in update))) return;

		const player = this.players.get(update.guild_id);

		if (!player) return;
		this.emit("debug", `[MANAGER] Updating voice state: ${JSON.stringify(update)}`);
		if ("token" in update) {
			player.voiceState.event = update;

			const {
				sessionId,
				event: { token, endpoint },
			} = player.voiceState;

			await player.node.rest.updatePlayer({
				guildId: player.guildId,
				data: { voice: { token, endpoint, sessionId } },
			});

			return;
		}

		if (update.user_id !== this.options.clientId) return;
		if (update.channel_id) {
			if (player.voiceChannelId !== update.channel_id) {
				this.emit("playerMove", player, player.voiceChannelId, update.channel_id);
			}

			player.voiceState.sessionId = update.session_id;
			player.voiceChannelId = update.channel_id;
			return;
		}

		this.emit("playerDisconnect", player, player.voiceChannelId);
		player.voiceChannelId = null;
		player.voiceState = Object.assign({});
		player.destroy();
		return;
	}
}

export interface Payload {
	/** The OP code */
	op: number;
	d: {
		guild_id: string;
		channel_id: string | null;
		self_mute: boolean;
		self_deaf: boolean;
	};
}

export interface ManagerOptions {
	/** Use priority mode over least amount of player or load? */
	usePriority?: boolean;
	/** Use the least amount of players or least load? */
	useNode?: UseNodeOptions.LeastLoad | UseNodeOptions.LeastPlayers;
	/** The array of nodes to connect to. */
	nodes?: NodeOptions[];
	/** The client ID to use. */
	clientId?: string;
	/** Value to use for the `Client-Name` header. */
	clientName?: string;
	/** A array of plugins to use. */
	plugins?: Plugin[];
	/** Whether players should automatically play the next song. */
	autoPlay?: boolean;
	/** The search platform autoplay should use. Failback to Youtube if not found.
	 * Use enum `SearchPlatform`. */
	autoPlaySearchPlatform?: SearchPlatform;
	/** An array of track properties to keep. `track` will always be present. */
	trackPartial?: string[];
	/** The default search platform to use.
	 * Use enum `SearchPlatform`. */
	defaultSearchPlatform?: SearchPlatform;
	/** Whether the YouTube video titles should be replaced if the Author does not exactly match. */
	replaceYouTubeCredentials?: boolean;
	/** The last.fm API key.
	 * If you need to create one go here: https://www.last.fm/api/account/create.
	 * If you already have one, get it from here: https://www.last.fm/api/accounts. */
	lastFmApiKey: string;
	/**
	 * Function to send data to the websocket.
	 * @param id The ID of the node to send the data to.
	 * @param payload The payload to send.
	 */
	send(id: string, payload: Payload): void;
}

export enum UseNodeOptions {
	LeastLoad = "leastLoad",
	LeastPlayers = "leastPlayers",
}

export type UseNodeOption = keyof typeof UseNodeOptions;

export enum SearchPlatform {
	AppleMusic = "amsearch",
	Bandcamp = "bcsearch",
	Deezer = "dzsearch",
	Jiosaavn = "jssearch",
	SoundCloud = "scsearch",
	Spotify = "spsearch",
	Tidal = "tdsearch",
	VKMusic = "vksearch",
	YouTube = "ytsearch",
	YouTubeMusic = "ytmsearch",
}

export enum PlayerStateEventTypes {
	AutoPlayChange = "playerAutoplay",
	ConnectionChange = "playerConnection",
	RepeatChange = "playerRepeat",
	PauseChange = "playerPause",
	QueueChange = "queueChange",
	TrackChange = "trackChange",
	VolumeChange = "volumeChange",
	ChannelChange = "channelChange",
	PlayerCreate = "playerCreate",
	PlayerDestroy = "playerDestroy",
}

interface PlayerStateUpdateEvent {
	changeType: PlayerStateEventTypes;
	details?:
		| AutoplayChangeEvent
		| ConnectionChangeEvent
		| RepeatChangeEvent
		| PauseChangeEvent
		| QueueChangeEvent
		| TrackChangeEvent
		| VolumeChangeEvent
		| ChannelChangeEvent;
}

interface AutoplayChangeEvent {
	previousAutoplay: boolean;
	currentAutoplay: boolean;
}

interface ConnectionChangeEvent {
	changeType: "connect" | "disconnect";
	previousConnection: boolean;
	currentConnection: boolean;
}

interface RepeatChangeEvent {
	changeType: "dynamic" | "track" | "queue" | null;
	previousRepeat: string | null;
	currentRepeat: string | null;
}

interface PauseChangeEvent {
	previousPause: boolean | null;
	currentPause: boolean | null;
}

interface QueueChangeEvent {
	changeType: "add" | "remove" | "clear" | "shuffle" | "roundRobin" | "userBlock" | "autoPlayAdd";
	tracks?: Track[];
}

interface TrackChangeEvent {
	changeType: "start" | "end" | "previous" | "timeUpdate" | "autoPlay";
	track: Track;
	previousTime?: number | null;
	currentTime?: number | null;
}

interface VolumeChangeEvent {
	previousVolume: number | null;
	currentVolume: number | null;
}

interface ChannelChangeEvent {
	changeType: "text" | "voice";
	previousChannel: string | null;
	currentChannel: string | null;
}

export interface SearchQuery {
	/** The source to search from. */
	source?: SearchPlatform;
	/** The query to search for. */
	query: string;
}

export interface LavalinkResponse {
	loadType: LoadTypes;
	data: TrackData[] | PlaylistRawData;
}

interface LavaPlayer {
	guildId: string;
	track: TrackData | Track;
	volume: number;
	paused: boolean;
	state: {
		time: number;
		position: number;
		connected: boolean;
		ping: number;
	};
	voice: {
		token: string;
		endpoint: string;
		sessionId: string;
	};
	filters: Record<string, unknown>;
}

export interface SearchResult {
	/** The load type of the result. */
	loadType: LoadTypes;
	/** The array of tracks from the result. */
	tracks: Track[];
	/** The playlist info if the load type is 'playlist'. */
	playlist?: PlaylistData;
}

export interface PlaylistRawData {
	info: {
		/** The playlist name. */
		name: string;
	};
	/** Addition info provided by plugins. */
	pluginInfo: object;
	/** The tracks of the playlist */
	tracks: TrackData[];
}

export interface PlaylistInfoData {
	/** Url to playlist. */
	url: string;
	/** Type is always playlist in that case. */
	type: string;
	/** ArtworkUrl of playlist */
	artworkUrl: string;
	/** Number of total tracks in playlist */
	totalTracks: number;
	/** Author of playlist */
	author: string;
}

export interface PlaylistData {
	/** The playlist name. */
	name: string;
	/** Requester of playlist. */
	requester: User | ClientUser;
	/** More playlist information. */
	playlistInfo: PlaylistInfoData[];
	/** The length of the playlist. */
	duration: number;
	/** The songs of the playlist. */
	tracks: Track[];
}

export enum ManagerEventTypes {
	Debug = "debug",
	NodeCreate = "nodeCreate",
	NodeDestroy = "nodeDestroy",
	NodeConnect = "nodeConnect",
	NodeReconnect = "nodeReconnect",
	NodeDisconnect = "nodeDisconnect",
	NodeError = "nodeError",
	NodeRaw = "nodeRaw",
	PlayerCreate = "playerCreate",
	PlayerDestroy = "playerDestroy",
	PlayerStateUpdate = "playerStateUpdate",
	PlayerMove = "playerMove",
	PlayerDisconnect = "playerDisconnect",
	QueueEnd = "queueEnd",
	SocketClosed = "socketClosed",
	TrackStart = "trackStart",
	TrackEnd = "trackEnd",
	TrackStuck = "trackStuck",
	TrackError = "trackError",
	SegmentsLoaded = "segmentsLoaded",
	SegmentSkipped = "segmentSkipped",
	ChapterStarted = "chapterStarted",
	ChaptersLoaded = "chaptersLoaded",
}
export interface ManagerEvents {
	[ManagerEventTypes.Debug]: [info: string];
	[ManagerEventTypes.NodeCreate]: [node: Node];
	[ManagerEventTypes.NodeDestroy]: [node: Node];
	[ManagerEventTypes.NodeConnect]: [node: Node];
	[ManagerEventTypes.NodeReconnect]: [node: Node];
	[ManagerEventTypes.NodeDisconnect]: [node: Node, reason: { code?: number; reason?: string }];
	[ManagerEventTypes.NodeError]: [node: Node, error: Error];
	[ManagerEventTypes.NodeRaw]: [payload: unknown];
	[ManagerEventTypes.PlayerCreate]: [player: Player];
	[ManagerEventTypes.PlayerDestroy]: [player: Player];
	[ManagerEventTypes.PlayerStateUpdate]: [oldPlayer: Player, newPlayer: Player, changeType: PlayerStateUpdateEvent];
	[ManagerEventTypes.PlayerMove]: [player: Player, initChannel: string, newChannel: string];
	[ManagerEventTypes.PlayerDisconnect]: [player: Player, oldChannel: string];
	[ManagerEventTypes.QueueEnd]: [player: Player, track: Track, payload: TrackEndEvent];
	[ManagerEventTypes.SocketClosed]: [player: Player, payload: WebSocketClosedEvent];
	[ManagerEventTypes.TrackStart]: [player: Player, track: Track, payload: TrackStartEvent];
	[ManagerEventTypes.TrackEnd]: [player: Player, track: Track, payload: TrackEndEvent];
	[ManagerEventTypes.TrackStuck]: [player: Player, track: Track, payload: TrackStuckEvent];
	[ManagerEventTypes.TrackError]: [player: Player, track: Track, payload: TrackExceptionEvent];
	[ManagerEventTypes.SegmentsLoaded]: [player: Player, track: Track, payload: SponsorBlockSegmentsLoaded];
	[ManagerEventTypes.SegmentSkipped]: [player: Player, track: Track, payload: SponsorBlockSegmentSkipped];
	[ManagerEventTypes.ChapterStarted]: [player: Player, track: Track, payload: SponsorBlockChapterStarted];
	[ManagerEventTypes.ChaptersLoaded]: [player: Player, track: Track, payload: SponsorBlockChaptersLoaded];
}
