import { PlayerEvent, PlayerEvents, Structure, TrackEndEvent, TrackExceptionEvent, TrackStartEvent, TrackStuckEvent, WebSocketClosedEvent } from './Utils';
import { Manager } from './Manager';
import { Player, Track, UnresolvedTrack } from './Player';
import { Rest } from './Rest';
import nodeCheck from '../utils/nodeCheck';
import WebSocket from 'ws';

export class Node {
	/** The socket for the node. */
	public socket: WebSocket | null = null;
	/** The stats for the node. */
	public stats: NodeStats;
	public manager: Manager;
	/** The node's session ID. */
	public sessionId: string | null;
	/** The REST instance. */
	public readonly rest: Rest;

	private static _manager: Manager;
	private reconnectTimeout?: NodeJS.Timeout;
	private reconnectAttempts = 1;

	/** Returns if connected to the Node. */
	public get connected(): boolean {
		if (!this.socket) return false;
		return this.socket.readyState === WebSocket.OPEN;
	}

	/** Returns the address for this node. */
	public get address(): string {
		return `${this.options.host}:${this.options.port}`;
	}

	/** @hidden */
	public static init(manager: Manager): void {
		this._manager = manager;
	}

	/**
	 * Creates an instance of Node.
	 * @param options
	 */
	constructor(public options: NodeOptions) {
		if (!this.manager) this.manager = Structure.get('Node')._manager;
		if (!this.manager) throw new RangeError('Manager has not been initiated.');

		if (this.manager.nodes.has(options.identifier || options.host)) {
			return this.manager.nodes.get(options.identifier || options.host);
		}

		nodeCheck(options);

		this.options = {
			port: 2333,
			password: 'youshallnotpass',
			secure: false,
			retryAmount: 5,
			retryDelay: 30e3,
			priority: 0,
			...options,
		};

		if (this.options.secure) {
			this.options.port = 443;
		}

		this.options.identifier = options.identifier || options.host;
		this.stats = {
			players: 0,
			playingPlayers: 0,
			uptime: 0,
			memory: {
				free: 0,
				used: 0,
				allocated: 0,
				reservable: 0,
			},
			cpu: {
				cores: 0,
				systemLoad: 0,
				lavalinkLoad: 0,
			},
			frameStats: {
				sent: 0,
				nulled: 0,
				deficit: 0,
			},
		};

		this.manager.nodes.set(this.options.identifier, this);
		this.manager.emit('nodeCreate', this);
		this.rest = new Rest(this);
	}

	/** Connects to the Node. */
	public connect(): void {
		if (this.connected) return;

		const headers = Object.assign({
			Authorization: this.options.password,
			'Num-Shards': String(this.manager.options.shards),
			'User-Id': this.manager.options.clientId,
			'Client-Name': this.manager.options.clientName,
		});

		this.socket = new WebSocket(`ws${this.options.secure ? 's' : ''}://${this.address}/v4/websocket`, { headers });
		this.socket.on('open', this.open.bind(this));
		this.socket.on('close', this.close.bind(this));
		this.socket.on('message', this.message.bind(this));
		this.socket.on('error', this.error.bind(this));
	}

	/** Destroys the Node and all players connected with it. */
	public destroy(): void {
		if (!this.connected) return;

		const players = this.manager.players.filter((p) => p.node == this);
		if (players.size) players.forEach((p) => p.destroy());

		this.socket.close(1000, 'destroy');
		this.socket.removeAllListeners();
		this.socket = null;

		this.reconnectAttempts = 1;
		clearTimeout(this.reconnectTimeout);

		this.manager.emit('nodeDestroy', this);
		this.manager.destroyNode(this.options.identifier);
	}

	private reconnect(): void {
		this.reconnectTimeout = setTimeout(() => {
			if (this.reconnectAttempts >= this.options.retryAmount) {
				const error = new Error(`Unable to connect after ${this.options.retryAmount} attempts.`);

				this.manager.emit('nodeError', this, error);
				return this.destroy();
			}
			this.socket?.removeAllListeners();
			this.socket = null;
			this.manager.emit('nodeReconnect', this);
			this.connect();
			this.reconnectAttempts++;
		}, this.options.retryDelay);
	}

	protected open(): void {
		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
		this.manager.emit('nodeConnect', this);
	}

	protected close(code: number, reason: string): void {
		this.manager.emit('nodeDisconnect', this, { code, reason });
		if (code !== 1000 || reason !== 'destroy') this.reconnect();
	}

	protected error(error: Error): void {
		if (!error) return;
		this.manager.emit('nodeError', this, error);
	}

	protected message(d: Buffer | string): void {
		if (Array.isArray(d)) d = Buffer.concat(d);
		else if (d instanceof ArrayBuffer) d = Buffer.from(d);

		const payload = JSON.parse(d.toString());

		if (!payload.op) return;
		this.manager.emit('nodeRaw', payload);

		let player: Player;

		switch (payload.op) {
			case 'stats':
				delete payload.op;
				this.stats = { ...payload } as unknown as NodeStats;
				break;
			case 'playerUpdate':
				player = this.manager.players.get(payload.guildId);
				if (player) player.position = payload.state.position || 0;
				break;
			case 'event':
				this.handleEvent(payload);
				break;
			case 'ready':
				this.rest.setSessionId(payload.sessionId);
				this.sessionId = payload.sessionId;

				if (this.options.resumeStatus) {
					this.rest.patch(`/v4/sessions/${this.sessionId}`, {
						resuming: this.options.resumeStatus,
						timeout: this.options.resumeTimeout,
					});
				}
				break;
			default:
				this.manager.emit('nodeError', this, new Error(`Unexpected op "${payload.op}" with data: ${payload.message}`));
				return;
		}
	}

	protected handleEvent(payload: PlayerEvent & PlayerEvents): void {
		if (!payload.guildId) return;

		const player = this.manager.players.get(payload.guildId);
		if (!player) return;

		const track = player.queue.current;
		const type = payload.type;

		let error: Error;
		switch (type) {
			case 'TrackStartEvent':
				this.trackStart(player, track as Track, payload);
				break;

			case 'TrackEndEvent':
				if (player?.nowPlayingMessage && !player?.nowPlayingMessage?.deleted) {
					player?.nowPlayingMessage?.delete().catch(() => {});
				}

				this.trackEnd(player, track as Track, payload);
				break;

			case 'TrackStuckEvent':
				this.trackStuck(player, track as Track, payload);
				break;

			case 'TrackExceptionEvent':
				this.trackError(player, track, payload);
				break;

			case 'WebSocketClosedEvent':
				this.socketClosed(player, payload);
				break;

			default:
				error = new Error(`Node#event unknown event '${type}'.`);
				this.manager.emit('nodeError', this, error);
				break;
		}
	}

	protected async trackStart(player: Player, track: Track, payload: TrackStartEvent): Promise<void> {
		player.playing = true;
		player.paused = false;
		this.manager.emit('trackStart', player, track, payload);
	}

	protected async trackEnd(player: Player, track: Track, payload: TrackEndEvent): Promise<void> {
		const { reason } = payload;

		// If the track failed to load or was cleaned up
		if (['loadFailed', 'cleanup'].includes(reason)) {
			this.handleFailedTrack(player, track, payload);
		}
		// If the track was forcibly replaced
		else if (reason === 'replaced') {
			this.manager.emit('trackEnd', player, track, payload);
			player.queue.previous = player.queue.current;
		}
		// If the track ended and it's set to repeat (track or queue)
		else if (track && (player.trackRepeat || player.queueRepeat)) {
			this.handleRepeatedTrack(player, track, payload);
		}
		// If there's another track in the queue
		else if (player.queue.length) {
			this.playNextTrack(player, track, payload);
		}
		// If there are no more tracks in the queue
		else {
			this.queueEnd(player, track, payload);
			const previousTrack = player.queue.previous;

			if (!player.isAutoplay || !previousTrack) return;

			const hasYouTubeURL = ['youtube.com', 'youtu.be'].some((url) => previousTrack.uri.includes(url));

			let videoID = previousTrack.uri.substring(previousTrack.uri.indexOf('=') + 1);

			if (!hasYouTubeURL) {
				const res = await player.search(`${previousTrack.author} - ${previousTrack.title}`);

				videoID = res.tracks[0].uri.substring(res.tracks[0].uri.indexOf('=') + 1);
			}

			let randomIndex: number;
			let searchURI: string;

			do {
				randomIndex = Math.floor(Math.random() * 23) + 2;
				searchURI = `https://www.youtube.com/watch?v=${videoID}&list=RD${videoID}&index=${randomIndex}`;
			} while (track.uri.includes(searchURI));

			const res = await player.search(searchURI, player.get('Internal_BotUser'));

			if (res.loadType === 'empty' || res.loadType === 'error') return;

			let tracks = res.tracks;

			if (res.loadType === 'playlist') {
				tracks = res.playlist.tracks;
			}

			const foundTrack = tracks.sort(() => Math.random() - 0.5).find((shuffledTrack) => shuffledTrack.uri !== track.uri);

			if (foundTrack) {
				player.queue.add(foundTrack);
				player.play();
			}
		}
	}

	// Handle the case when a track failed to load or was cleaned up
	private handleFailedTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		player.queue.previous = player.queue.current;
		player.queue.current = player.queue.shift();

		if (!player.queue.current) {
			this.queueEnd(player, track, payload);
			return;
		}

		this.manager.emit('trackEnd', player, track, payload);
		if (this.manager.options.autoPlay) player.play();
	}

	// Handle the case when a track ended and it's set to repeat (track or queue)
	private handleRepeatedTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		player.queue.previous = player.queue.current;

		if (payload.reason === 'stopped') {
			player.queue.current = player.queue.shift();
			if (!player.queue.current) {
				this.queueEnd(player, track, payload);
				return;
			}
		} else {
			player.queue.add(player.queue.current);
			player.queue.current = player.queue.shift();
		}

		this.manager.emit('trackEnd', player, track, payload);
		if (this.manager.options.autoPlay) player.play();
	}

	// Handle the case when there's another track in the queue
	private playNextTrack(player: Player, track: Track, payload: TrackEndEvent): void {
		player.queue.previous = player.queue.current;
		player.queue.current = player.queue.shift();

		this.manager.emit('trackEnd', player, track, payload);
		if (this.manager.options.autoPlay) player.play();
	}

	protected queueEnd(player: Player, track: Track, payload: TrackEndEvent): void {
		player.queue.previous = player.queue.current;
		player.queue.current = null;
		player.playing = false;
		this.manager.emit('queueEnd', player, track, payload);
	}

	protected trackStuck(player: Player, track: Track, payload: TrackStuckEvent): void {
		player.stop();
		this.manager.emit('trackStuck', player, track, payload);
	}

	protected trackError(player: Player, track: Track | UnresolvedTrack, payload: TrackExceptionEvent): void {
		player.stop();
		this.manager.emit('trackError', player, track, payload);
	}

	protected socketClosed(player: Player, payload: WebSocketClosedEvent): void {
		this.manager.emit('socketClosed', player, payload);
	}
}

export interface NodeOptions {
	/** The host for the node. */
	host: string;
	/** The port for the node. */
	port?: number;
	/** The password for the node. */
	password?: string;
	/** Whether the host uses SSL. */
	secure?: boolean;
	/** The identifier for the node. */
	identifier?: string;
	/** The retryAmount for the node. */
	retryAmount?: number;
	/** The retryDelay for the node. */
	retryDelay?: number;
	/** Whether to resume the previous session. */
	resumeStatus?: boolean;
	/** The time the manager will wait before trying to resume the previous session. */
	resumeTimeout?: number;
	/** The timeout used for api calls. */
	requestTimeout?: number;
	/** Priority of the node. */
	priority?: number;
}

export interface NodeStats {
	/** The amount of players on the node. */
	players: number;
	/** The amount of playing players on the node. */
	playingPlayers: number;
	/** The uptime for the node. */
	uptime: number;
	/** The memory stats for the node. */
	memory: MemoryStats;
	/** The cpu stats for the node. */
	cpu: CPUStats;
	/** The frame stats for the node. */
	frameStats: FrameStats;
}

export interface MemoryStats {
	/** The free memory of the allocated amount. */
	free: number;
	/** The used memory of the allocated amount. */
	used: number;
	/** The total allocated memory. */
	allocated: number;
	/** The reservable memory. */
	reservable: number;
}

export interface CPUStats {
	/** The core amount the host machine has. */
	cores: number;
	/** The system load. */
	systemLoad: number;
	/** The lavalink load. */
	lavalinkLoad: number;
}

export interface FrameStats {
	/** The amount of sent frames. */
	sent?: number;
	/** The amount of nulled frames. */
	nulled?: number;
	/** The amount of deficit frames. */
	deficit?: number;
}
