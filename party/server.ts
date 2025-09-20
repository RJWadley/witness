import type * as Party from "partykit/server";
import type { ClientMessage, GameState, Player } from "../shared/game";
import {
	buildDeck,
	clientMessageSchema,
	defaultRoleConfig,
	rolesCatalog,
	shuffle,
	totalRoles,
} from "../shared/game";

export default class Server implements Party.Server {
	state: GameState;
	connections: Set<Party.Connection> = new Set();
	connectionIdToClientId: Map<string, string> = new Map();

	constructor(readonly room: Party.Room) {
		this.state = {
			roomId: room.id,
			hostId: null,
			status: "lobby",
			players: {},
			roleConfig: { ...defaultRoleConfig },
			rolesCatalog,
		};
	}

	onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
		this.connections.add(conn);
		console.log(
			`connected id=${conn.id} room=${this.room.id} url=${new URL(ctx.request.url).pathname}`,
		);
		// ask the client to join with their clientId and name
		this.send(conn, { type: "state", state: this.personalizeStateFor(null) });
	}

	onClose(conn: Party.Connection) {
		this.connections.delete(conn);
		const clientId = this.connectionIdToClientId.get(conn.id);
		if (clientId) {
			// keep player data to preserve id/name across reconnects
			this.connectionIdToClientId.delete(conn.id);
		}
	}

	onMessage(raw: string, sender: Party.Connection) {
		let msg: ClientMessage | null = null;
		try {
			const parsed = JSON.parse(raw);
			msg = clientMessageSchema.parse(parsed);
		} catch (err) {
			console.warn("invalid message", err);
			this.send(sender, { type: "error", message: "invalid message" });
			return;
		}

		switch (msg.type) {
			case "join": {
				if (!msg.clientId) {
					this.send(sender, { type: "error", message: "missing clientId" });
					return;
				}
				this.connectionIdToClientId.set(sender.id, msg.clientId);
				const now = Date.now();
				const existing = this.state.players[msg.clientId];
				if (existing) {
					// preserve existing player record (server-owned name)
				} else {
					const isFirst = Object.keys(this.state.players).length === 0;
					this.state.players[msg.clientId] = {
						id: msg.clientId,
						name: generateOldTimeyName(),
						isHost: isFirst,
						joinedAt: now,
					};
					if (isFirst) this.state.hostId = msg.clientId;
				}
				this.broadcastState();
				break;
			}
			// name and ready are no longer editable by clients in v1.1
			case "setRoleCount": {
				const player = this.getSenderPlayer(sender);
				if (!player || !player.isHost) {
					this.send(sender, {
						type: "error",
						message: "only host can edit roles",
					});
					return;
				}
				if (!msg.roleKey || typeof msg.count !== "number") return;
				this.state.roleConfig[msg.roleKey] = Math.max(
					0,
					Math.min(99, msg.count),
				);
				this.broadcastState();
				break;
			}
			case "assignRoles": {
				const player = this.getSenderPlayer(sender);
				if (!player || !player.isHost) {
					this.send(sender, {
						type: "error",
						message: "only host can assign roles",
					});
					return;
				}
				const playerIds = Object.keys(this.state.players);
				const deck = buildDeck(this.state.roleConfig);
				if (deck.length !== playerIds.length) {
					this.send(sender, {
						type: "error",
						message: "role count must equal number of players",
					});
					return;
				}
				const orderedPlayers = playerIds
					.map((id) => this.state.players[id] as Player)
					.sort((a: Player, b: Player) => a.joinedAt - b.joinedAt);
				const shuffled = shuffle(deck);
				for (let i = 0; i < orderedPlayers.length; i++) {
					orderedPlayers[i].roleKey = shuffled[i];
				}
				this.state.status = "assigned";
				this.state.assignedAt = Date.now();
				this.broadcastState();
				break;
			}
			case "reset": {
				const player = this.getSenderPlayer(sender);
				if (!player || !player.isHost) {
					this.send(sender, { type: "error", message: "only host can reset" });
					return;
				}
				for (const id of Object.keys(this.state.players)) {
					this.state.players[id].roleKey = undefined;
				}
				this.state.status = "lobby";
				this.state.assignedAt = undefined;
				this.broadcastState();
				break;
			}
			case "requestState": {
				this.sendStateTo(sender);
				break;
			}
			default:
				this.send(sender, { type: "error", message: "unknown message type" });
		}
	}

	onRequest(req: Party.Request) {
		// return a summary state for debugging; not used by client in v1
		if (req.method === "GET") {
			const summary = {
				roomId: this.state.roomId,
				status: this.state.status,
				players: (Object.values(this.state.players) as Player[]).map(
					(p: Player) => ({
						id: p.id,
						name: p.name,
						isHost: p.isHost,
					}),
				),
				roleConfig: this.state.roleConfig,
				totalRoles: totalRoles(this.state.roleConfig),
			};
			return Response.json(summary);
		}
		return new Response("method not allowed", { status: 405 });
	}

	// ----- helpers -----
	getSenderPlayer(conn: Party.Connection): Player | undefined {
		const clientId = this.connectionIdToClientId.get(conn.id);
		if (!clientId) {
			this.send(conn, { type: "error", message: "please join first" });
			return undefined;
		}
		return this.state.players[clientId];
	}

	findNextHostId(): string | null {
		const remaining = Object.values(this.state.players);
		if (remaining.length === 0) return null;
		remaining.sort((a, b) => a.joinedAt - b.joinedAt);
		return remaining[0].id;
	}

	personalizeStateFor(viewerClientId: string | null): GameState {
		// deep clone shallowly and redact others' roleKey
		const players: GameState["players"] = {};
		for (const [id, p] of Object.entries(this.state.players)) {
			players[id] = { ...p };
			if (!viewerClientId || id !== viewerClientId) {
				players[id].roleKey = undefined;
			}
		}
		return {
			...this.state,
			players,
		};
	}

	sendStateTo(conn: Party.Connection) {
		const clientId = this.connectionIdToClientId.get(conn.id) ?? null;
		this.send(conn, {
			type: "state",
			state: this.personalizeStateFor(clientId),
		});
	}

	broadcastState() {
		for (const conn of this.connections) {
			this.sendStateTo(conn);
		}
	}

	send(conn: Party.Connection, data: unknown) {
		try {
			conn.send(JSON.stringify(data));
		} catch (e) {
			console.warn("failed to send", e);
		}
	}
}

Server satisfies Party.Worker;

function generateOldTimeyName(): string {
	const first = [
		"agnes",
		"beatrice",
		"clement",
		"dorothy",
		"edmund",
		"florence",
		"gilbert",
		"harriet",
		"ira",
		"judith",
		"katharine",
		"leopold",
		"mabel",
		"nora",
		"oswald",
		"pearl",
		"quincy",
		"rosalind",
		"silas",
		"thelma",
		"ulysses",
		"victor",
		"wilhelmina",
		"xavier",
		"yvette",
		"zeke",
	];
	const last = [
		"abbott",
		"barnaby",
		"carrington",
		"davenport",
		"ellsworth",
		"farnsworth",
		"gafford",
		"hathaway",
		"inglewood",
		"jennings",
		"kensington",
		"lancaster",
		"montgomery",
		"norwood",
		"oakley",
		"pendleton",
		"quidley",
		"rosenberg",
		"sinclair",
		"thornton",
		"upton",
		"vanderbilt",
		"whitaker",
		"york",
		"zabriski",
	];
	const f = first[Math.floor(Math.random() * first.length)];
	const l = last[Math.floor(Math.random() * last.length)];
	return `${f} ${l}`;
}
