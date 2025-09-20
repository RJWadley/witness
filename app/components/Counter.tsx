import PartySocket from "partysocket";
import usePartySocket from "partysocket/react";
import { useState } from "react";
import { styled } from "restyle";
import z from "zod";

const message = z.number();

// We're not using server-side rendering and initial props in this
// example (our app is client-side only), so loadInitialCount is not
// used. But if we were using SSR, we would use this function to load
// the initial count, as returned by onRequest in `party/server.ts`.
export async function loadInitialCount(host: string) {
	const initialCount = await PartySocket.fetch(
		{
			host,
			party: "counter",
			room: "index",
		},
		{
			method: "GET",
		},
	).then((res) => res.text());
	return message.parse(initialCount);
}

export default function Counter() {
	const [count, setCount] = useState<number | null>(null);

	const socket = usePartySocket({
		// host defaults to the current URL if not set
		//host: process.env.PARTYKIT_HOST,
		// we could use any room name here
		room: "example-room",
		onMessage(evt) {
			setCount(message.parse(evt.data));
		},
	});

	const increment = () => {
		// optimistic local update
		setCount((prev) => prev ?? 0 + 1);
		// send the update to the server
		socket.send("increment");
	};

	return (
		<Button onClick={increment} type="button">
			Increment me! {count !== null && <>Count: {count}</>}
		</Button>
	);
}

const Button = styled("button", {
	backgroundColor: "#ff0f0f",
	borderRadius: "9999px",
	border: "none",
	color: "white",
	fontSize: "0.95rem",
	cursor: "pointer",
	padding: "1rem 3rem",
	margin: "1rem 0rem",
});
