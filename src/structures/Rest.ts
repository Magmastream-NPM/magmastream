import { Node } from "./Node";
import axios, { AxiosRequestConfig } from "axios";

/** Handles the requests sent to the Lavalink REST API. */
export class Rest {
	/** The Node that this Rest instance is connected to. */
	private node: Node;
	/** The ID of the current session. */
	private sessionId: string;
	/** The password for the Node. */
	private readonly password: string;
	/** The URL of the Node. */
	private readonly url: string;

	constructor(node: Node) {
		this.node = node;
		this.url = `http${node.options.secure ? "s" : ""}://${node.options.host}:${node.options.port}`;
		this.sessionId = node.sessionId;
		this.password = node.options.password;
	}

	/**
	 * Sets the session ID.
	 * @returns {string} Returns the session ID.
	 */
	public setSessionId(sessionId: string): string {
		this.sessionId = sessionId;
		return this.sessionId;
	}

	/** Retrieves all the players that are currently running on the node. */
	public async getAllPlayers(): Promise<unknown> {
		return await this.get(`/v4/sessions/${this.sessionId}/players`);
	}

	/** Sends a PATCH request to update player related data. */
	public async updatePlayer(options: playOptions): Promise<unknown> {
		return await this.patch(`/v4/sessions/${this.sessionId}/players/${options.guildId}?noReplace=false`, options.data);
	}

	/** Sends a DELETE request to the server to destroy the player. */
	public async destroyPlayer(guildId: string): Promise<unknown> {
		return await this.delete(`/v4/sessions/${this.sessionId}/players/${guildId}`);
	}

	/* Sends a GET request to the specified endpoint and returns the response data. */
	private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
		const config: AxiosRequestConfig = {
			method,
			url: this.url + endpoint,
			headers: {
				"Content-Type": "application/json",
				Authorization: this.password,
			},
			data: body,
		};

		try {
			const response = await axios(config);
			return response.data;
		} catch(error) {
			if (error?.response?.status === 404) {
				this.node.destroy();
				this.node.manager.createNode(this.node.options).connect();
			}

			return null;
		}
	}

	/* Sends a GET request to the specified endpoint and returns the response data. */
	public async get(endpoint: string): Promise<unknown> {
		return await this.request("GET", endpoint);
	}

	/* Sends a PATCH request to the specified endpoint and returns the response data. */
	public async patch(endpoint: string, body: unknown): Promise<unknown> {
		return await this.request("PATCH", endpoint, body);
	}

	/* Sends a POST request to the specified endpoint and returns the response data. */
	public async post(endpoint: string, body: unknown): Promise<unknown> {
		return await this.request("POST", endpoint, body);
	}

	/* Sends a DELETE request to the specified endpoint and returns the response data. */
	public async delete(endpoint: string): Promise<unknown> {
		return await this.request("DELETE", endpoint);
	}
}

interface playOptions {
	guildId: string;
	data: {
		/** The base64 encoded track. */
		encodedTrack?: string;
		/** The track ID. */
		identifier?: string;
		/** The track time to start at. */
		startTime?: number;
		/** The track time to end at. */
		endTime?: number;
		/** The player volume level. */
		volume?: number;
		/** The player position in a track. */
		position?: number;
		/** Whether the player is paused. */
		paused?: boolean;
		/** The audio effects. */
		filters?: object;
		/** voice payload. */
		voice?: {
			token: string;
			sessionId: string;
			endpoint: string;
		};
		/** Whether to not replace the track if a play payload is sent. */
		noReplace?: boolean;
	};
}
