import "./styles.css";
import { createRoot } from "react-dom/client";
import usePartySocket from "partysocket/react";
import { useEffect, useMemo, useState } from "react";
import { styled } from "restyle";
import type { GameState, Player } from "../shared/game";
import { computeImpactScore, rolesCatalog, roleKeys } from "../shared/game";

function App() {
	const [hash, setHash] = useState<string>(window.location.hash);
	useEffect(() => {
		const onHash = () => setHash(window.location.hash);
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);
	const raw = hash.startsWith("#/") ? hash.slice(2) : hash.replace(/^#/, "");
	if (!raw) return <Home />;
	return <Room roomId={raw} />;
}

function Home() {
	const createGame = () => {
		const id = crypto.randomUUID().split("-")[0];
		window.location.hash = `/${id}`;
	};
	return (
		<Container>
			<h1>witness</h1>
			<Button type="button" onClick={createGame}>
				create game
			</Button>
		</Container>
	);
}

type ServerMessage =
	| { type: "state"; state: GameState }
	| { type: "error"; message: string };

function Room({ roomId }: { roomId: string }) {
	const [state, setState] = useState<GameState | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [clientId] = useState<string>(() => {
		const k = "clientId";
		const v = localStorage.getItem(k);
		if (v) return v;
		const n = crypto.randomUUID();
		localStorage.setItem(k, n);
		return n;
	});

	const socket = usePartySocket({
		room: roomId,
		onOpen() {
			send({
				type: "join",
				clientId,
				name: localStorage.getItem("name") || "",
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

	const me: Player | null = useMemo(() => {
		if (!state) return null;
		return state.players[clientId] ?? null;
	}, [state, clientId]);

	const copyLink = async () => {
		await navigator.clipboard.writeText(window.location.href);
	};

	if (!state)
		return (
			<Container>
				<p>connecting…</p>
			</Container>
		);

	const playerCount = Object.keys(state.players).length;
	const totalRoles = roleKeys.reduce(
		(sum, k) => sum + (state.roleConfig[k] ?? 0),
		0,
	);
	const canAssign =
		state.status === "lobby" &&
		me?.isHost &&
		totalRoles === playerCount &&
		Object.values(state.players).every((p) => p.ready);

	return (
		<Container>
			<Header>
				<h2>room: {roomId}</h2>
				<Button type="button" onClick={copyLink}>
					copy link
				</Button>
			</Header>

			<Columns>
				<Column>
					<SectionTitle>players ({playerCount})</SectionTitle>
					<NameEditor
						me={me}
						onChange={(name) => {
							localStorage.setItem("name", name);
							send({ type: "setName", name });
						}}
					/>
					<ReadyToggle
						ready={!!me?.ready}
						onToggle={(ready) => send({ type: "setReady", ready })}
					/>
					<PlayerList players={state.players} meId={clientId} />
				</Column>
				<Column>
					{me?.isHost && state.status === "lobby" && (
						<HostPanel
							roleConfig={state.roleConfig}
							onChange={(key, count) =>
								send({ type: "setRoleCount", roleKey: key, count })
							}
							players={playerCount}
							totalRoles={totalRoles}
							onAssign={() => send({ type: "assignRoles" })}
							canAssign={!!canAssign}
							onReset={() => send({ type: "reset" })}
						/>
					)}
					{state.status === "assigned" && <AssignedView me={me} />}
				</Column>
			</Columns>

			{error && <ErrorText>{error}</ErrorText>}
		</Container>
	);
}

function NameEditor({
	me,
	onChange,
}: {
	me: Player | null;
	onChange: (name: string) => void;
}) {
	const [name, setName] = useState<string>(me?.name ?? "");
	useEffect(() => setName(me?.name ?? ""), [me?.name]);
	return (
		<Row>
			<input
				value={name}
				placeholder="your name"
				onChange={(e) => setName(e.target.value)}
			/>
			<Button type="button" onClick={() => onChange(name)}>
				save
			</Button>
		</Row>
	);
}

function ReadyToggle({
	ready,
	onToggle,
}: {
	ready: boolean;
	onToggle: (r: boolean) => void;
}) {
	return (
		<Row>
			<label>
				<input
					type="checkbox"
					checked={ready}
					onChange={(e) => onToggle(e.target.checked)}
				/>{" "}
				ready
			</label>
		</Row>
	);
}

function PlayerList({
	players,
	meId,
}: {
	players: Record<string, Player>;
	meId: string;
}) {
	const list = Object.values(players).sort((a, b) => a.joinedAt - b.joinedAt);
	return (
		<Card>
			{list.map((p) => (
				<div key={p.id}>
					{p.name || "anon"}
					{p.id === meId ? " (you)" : ""} {p.isHost ? "[host]" : ""}{" "}
					{p.ready ? "✅" : "⌛"}
				</div>
			))}
		</Card>
	);
}

function HostPanel({
	roleConfig,
	onChange,
	players,
	totalRoles,
	onAssign,
	canAssign,
	onReset,
}: {
	roleConfig: GameState["roleConfig"];
	onChange: (k: (typeof roleKeys)[number], c: number) => void;
	players: number;
	totalRoles: number;
	onAssign: () => void;
	canAssign: boolean;
	onReset: () => void;
}) {
	return (
		<Card>
			<SectionTitle>roles</SectionTitle>
			{roleKeys.map((k) => (
				<Row key={k}>
					<div style={{ width: 40 }}>{k}</div>
					<Button
						type="button"
						onClick={() => onChange(k, Math.max(0, (roleConfig[k] ?? 0) - 1))}
					>
						-
					</Button>
					<div style={{ width: 40, textAlign: "center" }}>
						{roleConfig[k] ?? 0}
					</div>
					<Button
						type="button"
						onClick={() => onChange(k, (roleConfig[k] ?? 0) + 1)}
					>
						+
					</Button>
				</Row>
			))}
			<Row>
				<div>players: {players}</div>
				<div>total roles: {totalRoles}</div>
			</Row>
			<Row>
				<Button type="button" disabled={!canAssign} onClick={onAssign}>
					assign roles
				</Button>
				<Button type="button" onClick={onReset}>
					reset
				</Button>
			</Row>
		</Card>
	);
}

function AssignedView({ me }: { me: Player | null }) {
	if (!me) return null;
	const myRole = rolesCatalog.find((r) => r.key === me.roleKey);
	const sorted = [...rolesCatalog].sort(
		(a, b) =>
			computeImpactScore(me.roleKey, b) - computeImpactScore(me.roleKey, a),
	);
	return (
		<div>
			<Card>
				<h3>your role: {myRole?.name ?? "unassigned"}</h3>
				<p>{myRole?.description ?? ""}</p>
			</Card>
			<Card>
				<SectionTitle>all roles</SectionTitle>
				{sorted.map((r) => (
					<div key={r.key}>
						<strong>
							{r.name} ({r.key})
						</strong>
						: {r.description}
					</div>
				))}
			</Card>
		</div>
	);
}

const root = document.getElementById("app");
if (root) createRoot(root).render(<App />);

// ----- styles -----
const Container = styled("main", {
	maxWidth: "960px",
	margin: "0 auto",
	padding: "1rem",
});
const Header = styled("div", {
	display: "flex",
	gap: "1rem",
	alignItems: "center",
	justifyContent: "space-between",
	marginBottom: "1rem",
});
const Columns = styled("div", {
	display: "grid",
	gridTemplateColumns: "1fr 1fr",
	gap: "1rem",
});
const Column = styled("div", {});
const Button = styled("button", {
	padding: "0.5rem 1rem",
	borderRadius: "8px",
	border: "1px solid #ddd",
	cursor: "pointer",
});
const Card = styled("div", {
	border: "1px solid #eee",
	borderRadius: "8px",
	padding: "0.75rem",
	marginBottom: "0.75rem",
});
const Row = styled("div", {
	display: "flex",
	gap: "0.5rem",
	alignItems: "center",
	marginBottom: "0.5rem",
});
const SectionTitle = styled("div", { fontWeight: 600, marginBottom: "0.5rem" });
const ErrorText = styled("div", { color: "#b00" });
