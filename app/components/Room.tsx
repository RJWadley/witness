import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import type { GameState, Player } from "../../shared/game";
import { computeImpactScore, roleKeys, rolesCatalog } from "../../shared/game";
import { useGameSocket } from "../hooks/useGameSocket";
import { getClientId } from "../lib/clientId";
import {
	ActionRow,
	Button,
	Card,
	ConnectingText,
	Container,
	ErrorText,
	MyRoleDescription,
	MyRoleTitle,
	PlayerBadge,
	PlayerItem,
	PlayerName,
	PrimaryButton,
	QRCodeText,
	QRCodeWrapper,
	QRContainer,
	RoleButton,
	RoleControls,
	RoleCount,
	RoleItem,
	RoleItemDescription,
	RoleItemName,
	RoleLabel,
	RoleRow,
	SectionTitle,
	StatItem,
	StatsRow,
} from "../styles/styles";

export function Room({ roomId }: { roomId: string }) {
	const [clientId] = useState<string>(getClientId);
	const { state, error, send } = useGameSocket(roomId, clientId);

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
				<ConnectingText>connecting…</ConnectingText>
			</Container>
		);

	const players = Object.values(state.players);
	const readyPlayers = players.filter((p) => p.isReady);
	const readyCount = readyPlayers.length;
	const totalRoles = roleKeys.reduce(
		(sum, k) => sum + (state.roleConfig[k] ?? 0),
		0,
	);
	const canAssign =
		state.status === "lobby" &&
		me?.isHost &&
		totalRoles === readyCount &&
		readyCount > 0;

	return (
		<Container>
			{/* pre-game: both host and players should see QR (expanded) and copy link first */}
			{state.status === "lobby" && (
				<LobbyTopBar roomId={roomId} onCopyLink={copyLink} />
			)}

			{/* host lobby layout */}
			{state.status === "lobby" && me?.isHost && (
				<>
					<HostRoleSelection
						roleConfig={state.roleConfig}
						onChange={(key, count) =>
							send({ type: "setRoleCount", roleKey: key, count })
						}
						players={readyCount}
						totalRoles={totalRoles}
					/>
					<PlayerList players={state.players} meId={clientId} />
					<ActionRow>
						<PrimaryButton
							type="button"
							disabled={!canAssign}
							onClick={() => send({ type: "assignRoles" })}
						>
							start game
						</PrimaryButton>
						<Button type="button" onClick={() => send({ type: "reset" })}>
							reset
						</Button>
					</ActionRow>
				</>
			)}

			{/* player lobby layout (non-host) */}
			{state.status === "lobby" && !me?.isHost && (
				<>
					<ReadyPanel
						isReady={!!me?.isReady}
						onToggle={(next) => send({ type: "setReady", ready: next })}
					/>
					<PlayerList players={state.players} meId={clientId} />
					<ActiveRolesList roleConfig={state.roleConfig} />
				</>
			)}

			{/* post-start views */}
			{state.status === "assigned" && (
				<div>
					{me?.isHost && (
						<ActionRow>
							<PrimaryButton
								type="button"
								onClick={() => send({ type: "reset" })}
							>
								reset game
							</PrimaryButton>
						</ActionRow>
					)}
					{me?.roleKey ? (
						<AssignedView me={me} />
					) : (
						<Card>
							<SectionTitle>no role assigned</SectionTitle>
							<MyRoleDescription>
								roles were assigned but you weren't ready
							</MyRoleDescription>
						</Card>
					)}
				</div>
			)}

			{error && <ErrorText>{error}</ErrorText>}
		</Container>
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
			<SectionTitle>players ({list.length})</SectionTitle>
			{list.map((p) => (
				<PlayerItem key={p.id}>
					<PlayerName>{p.name || "anon"}</PlayerName>
					{p.isReady && <PlayerBadge variant="ready">ready</PlayerBadge>}
					{p.isHost && <PlayerBadge variant="host">host</PlayerBadge>}
					{p.id === meId && <PlayerBadge>you</PlayerBadge>}
				</PlayerItem>
			))}
		</Card>
	);
}

function HostRoleSelection({
	roleConfig,
	onChange,
	players,
	totalRoles,
}: {
	roleConfig: GameState["roleConfig"];
	onChange: (k: (typeof roleKeys)[number], c: number) => void;
	players: number;
	totalRoles: number;
}) {
	return (
		<Card>
			<SectionTitle>role selection</SectionTitle>
			{roleKeys.map((k) => (
				<RoleRow key={k}>
					<RoleLabel>{k}</RoleLabel>
					<RoleControls>
						<RoleButton
							type="button"
							onClick={() => onChange(k, Math.max(0, (roleConfig[k] ?? 0) - 1))}
						>
							-
						</RoleButton>
						<RoleCount>{roleConfig[k] ?? 0}</RoleCount>
						<RoleButton
							type="button"
							onClick={() => onChange(k, (roleConfig[k] ?? 0) + 1)}
						>
							+
						</RoleButton>
					</RoleControls>
				</RoleRow>
			))}
			<StatsRow>
				<StatItem>ready players: {players}</StatItem>
				<StatItem>total roles: {totalRoles}</StatItem>
			</StatsRow>
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
				<MyRoleTitle>your role: {myRole?.name ?? "unassigned"}</MyRoleTitle>
				<MyRoleDescription>{myRole?.description ?? ""}</MyRoleDescription>
			</Card>
			<Card>
				<SectionTitle>all roles</SectionTitle>
				{sorted.map((r) => (
					<RoleItem key={r.key}>
						<RoleItemName>
							{r.name} ({r.key})
						</RoleItemName>
						<RoleItemDescription>{r.description}</RoleItemDescription>
					</RoleItem>
				))}
			</Card>
		</div>
	);
}

function QRCodeExpanded({ url }: { url: string }) {
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!url) return;
		QRCode.toDataURL(url, {
			width: 220,
			margin: 2,
			color: { dark: "#000000", light: "#FFFFFF" },
		})
			.then(setQrDataUrl)
			.catch(console.error);
	}, [url]);
	return (
		<QRContainer>
			{qrDataUrl && (
				<QRCodeWrapper>
					<img src={qrDataUrl} alt="QR Code for room link" />
					<QRCodeText>scan to join</QRCodeText>
				</QRCodeWrapper>
			)}
		</QRContainer>
	);
}

function LobbyTopBar({
	roomId,
	onCopyLink,
}: {
	roomId: string;
	onCopyLink: () => void;
}) {
	return (
		<Card>
			<SectionTitle>room: {roomId}</SectionTitle>
			<QRCodeExpanded url={window.location.href} />
			<ActionRow>
				<PrimaryButton type="button" onClick={onCopyLink}>
					copy link
				</PrimaryButton>
			</ActionRow>
		</Card>
	);
}

function ReadyPanel({
	isReady,
	onToggle,
}: {
	isReady: boolean;
	onToggle: (next: boolean) => void;
}) {
	return (
		<Card>
			<SectionTitle>ready up</SectionTitle>
			<ActionRow>
				<PrimaryButton type="button" onClick={() => onToggle(!isReady)}>
					{isReady ? "unready" : "i'm ready"}
				</PrimaryButton>
			</ActionRow>
		</Card>
	);
}

function ActiveRolesList({
	roleConfig,
}: {
	roleConfig: GameState["roleConfig"];
}) {
	const active = roleKeys.filter((k) => (roleConfig[k] ?? 0) > 0);
	return (
		<Card>
			<SectionTitle>active roles</SectionTitle>
			{active.length === 0 && (
				<MyRoleDescription>no roles selected yet</MyRoleDescription>
			)}
			{active.map((k) => {
				const spec = rolesCatalog.find((r) => r.key === k);
				return spec ? (
					<RoleItem key={k}>
						<RoleItemName>
							{spec.name} ({spec.key})
						</RoleItemName>
						<RoleItemDescription>{spec.description}</RoleItemDescription>
					</RoleItem>
				) : null;
			})}
		</Card>
	);
}
