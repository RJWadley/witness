import usePartySocket from "partysocket/react";
import { useState } from "react";
import type { GameState } from "../../shared/game";

type ServerMessage =
	| { type: "state"; state: GameState }
	| { type: "error"; message: string };

export function useGameSocket(roomId: string, clientId: string) {
	const [state, setState] = useState<GameState | null>(null);
	const [error, setError] = useState<string | null>(null);

	const socket = usePartySocket({
		room: roomId,
		onOpen() {
			send({
				type: "join",
				clientId,
			});
		},
		onMessage(evt) {
			try {
				const msg = JSON.parse(evt.data) as ServerMessage;
				if (msg.type === "state") setState(msg.state);
				else if (msg.type === "error") setError(msg.message);
			} catch (e) {
				console.warn("bad server message", e);
			}
		},
	});

	function send(msg: unknown) {
		socket.send(JSON.stringify(msg));
	}

	return { state, error, send };
}
