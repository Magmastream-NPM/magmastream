import { Node } from "./Node";
import axios, { AxiosRequestConfig } from "axios";
import { Manager, ManagerEventTypes } from "./Manager";

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
	/** The Manager instance. */
	public manager: Manager;

	constructor(node: Node, manager: Manager) {
		this.node = node;
		this.url = `http${node.options.useSSL ? "s" : ""}://${node.options.host}:${node.options.port}`;
		this.sessionId = node.sessionId;
		this.password = node.options.password;
		this.manager = manager;
	}

	/**
	 * Sets the session ID.
	 * This method is used to set the session ID after a resume operation is done.
	 * @param {string} sessionId The session ID to set.
	 * @returns {string} Returns the set session ID.
	 */
	public setSessionId(sessionId: string): string {
		this.sessionId = sessionId;
		return this.sessionId;
	}

	/**
	 * Retrieves all the players that are currently running on the node.
	 * @returns {Promise<unknown>} Returns the result of the GET request.
	 */
	public async getAllPlayers(): Promise<unknown> {
		// Send a GET request to the Lavalink Node to retrieve all the players.
		const result = await this.get(`/v4/sessions/${this.sessionId}/players`);

		// Log the result of the request.
		this.manager.emit(ManagerEventTypes.Debug, `[REST] Getting all players on node: ${this.node.options.identifier} : ${JSON.stringify(result)}`);

		// Return the result of the request.
		return result;
	}

	/**
	 * Sends a PATCH request to update player related data.
	 * @param {playOptions} options The options to update the player with.
	 * @returns {Promise<unknown>} Returns the result of the PATCH request.
	 */
	public async updatePlayer(options: playOptions): Promise<unknown> {
		// Log the request.
		this.manager.emit(ManagerEventTypes.Debug, `[REST] Updating player: ${options.guildId}: ${JSON.stringify(options)}`);

		// Send the PATCH request.
		return await this.patch(`/v4/sessions/${this.sessionId}/players/${options.guildId}?noReplace=false`, options.data);
	}

	/**
	 * Sends a DELETE request to the server to destroy the player.
	 * @param {string} guildId The guild ID of the player to destroy.
	 * @returns {Promise<unknown>} Returns the result of the DELETE request.
	 */
	public async destroyPlayer(guildId: string): Promise<unknown> {
		// Log the request.
		this.manager.emit(ManagerEventTypes.Debug, `[REST] Destroying player: ${guildId}`);
		// Send the DELETE request.
		return await this.delete(`/v4/sessions/${this.sessionId}/players/${guildId}`);
	}

	/**
	 * Updates the session status for resuming.
	 * This method sends a PATCH request to update the session's resuming status and timeout.
	 *
	 * @param {boolean} resuming - Indicates whether the session should be set to resuming.
	 * @param {number} timeout - The timeout duration for the session resume.
	 * @returns {Promise<unknown>} The result of the PATCH request.
	 */
	public async updateSession(resuming: boolean, timeout: number): Promise<unknown> {
		// Emit a debug event with information about the session being updated
		this.manager.emit(ManagerEventTypes.Debug, `[REST] Updating session: ${this.sessionId}`);

		// Send a PATCH request to update the session with the provided resuming status and timeout
		return await this.patch(`/v4/sessions/${this.sessionId}`, { resuming, timeout });
	}

	/**
	 * Sends a request to the specified endpoint and returns the response data.
	 * @param {string} method The HTTP method to use for the request.
	 * @param {string} endpoint The endpoint to send the request to.
	 * @param {unknown} [body] The data to send in the request body.
	 * @returns {Promise<unknown>} The response data of the request.
	 */
	private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
		this.manager.emit(ManagerEventTypes.Debug, `[REST] ${method} api call for endpoint: ${endpoint} with data: ${JSON.stringify(body)}`);
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
		} catch (error) {
			if (!error.response) {
				console.error("No response from node:", error.message);
				return null;
			}

			if (error.response.data?.message === "Guild not found") {
				return [];
			} else if (error.response.status === 404) {
				await this.node.destroy();
				this.node.manager.createNode(this.node.options).connect();
			}

			return null;
		}
	}

	/**
	 * Sends a GET request to the specified endpoint and returns the response data.
	 * @param {string} endpoint The endpoint to send the GET request to.
	 * @returns {Promise<unknown>} The response data of the GET request.
	 */
	public async get(endpoint: string): Promise<unknown> {
		// Send a GET request to the specified endpoint and return the response data.
		return await this.request("GET", endpoint);
	}

	/**
	 * Sends a PATCH request to the specified endpoint and returns the response data.
	 * @param {string} endpoint The endpoint to send the PATCH request to.
	 * @param {unknown} body The data to send in the request body.
	 * @returns {Promise<unknown>} The response data of the PATCH request.
	 */
	public async patch(endpoint: string, body: unknown): Promise<unknown> {
		// Send a PATCH request to the specified endpoint and return the response data.
		return await this.request("PATCH", endpoint, body);
	}

	/**
	 * Sends a POST request to the specified endpoint and returns the response data.
	 * @param {string} endpoint The endpoint to send the POST request to.
	 * @param {unknown} body The data to send in the request body.
	 * @returns {Promise<unknown>} The response data of the POST request.
	 */
	public async post(endpoint: string, body: unknown): Promise<unknown> {
		return await this.request("POST", endpoint, body);
	}

	/**
	 * Sends a PUT request to the specified endpoint and returns the response data.
	 * @param {string} endpoint The endpoint to send the PUT request to.
	 * @param {unknown} body The data to send in the request body.
	 * @returns {Promise<unknown>} The response data of the PUT request.
	 */
	public async put(endpoint: string, body: unknown): Promise<unknown> {
		// Send a PUT request to the specified endpoint and return the response data.
		return await this.request("PUT", endpoint, body);
	}

	/**
	 * Sends a DELETE request to the specified endpoint.
	 * @param {string} endpoint - The endpoint to send the DELETE request to.
	 * @returns {Promise<unknown>} The response data of the DELETE request.
	 */
	public async delete(endpoint: string): Promise<unknown> {
		// Send a DELETE request using the request method and return the response data.
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
