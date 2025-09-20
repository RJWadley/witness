import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { styled } from "restyle";
import type { GameState, Player } from "../../shared/game";
import { computeImpactScore, roleKeys, rolesCatalog } from "../../shared/game";
import { useGameSocket } from "../hooks/useGameSocket";
import { getClientId } from "../lib/clientId";

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

	const playerCount = Object.keys(state.players).length;
	const totalRoles = roleKeys.reduce(
		(sum, k) => sum + (state.roleConfig[k] ?? 0),
		0,
	);
	const canAssign =
		state.status === "lobby" && me?.isHost && totalRoles === playerCount;

	return (
		<Container>
			<Header>
				<h2>room: {roomId}</h2>
				<HeaderActions>
					<Button type="button" onClick={copyLink}>
						copy link
					</Button>
					<QRCodeDisplay url={window.location.href} />
				</HeaderActions>
			</Header>

			<Columns>
				<Column>
					<SectionTitle>players ({playerCount})</SectionTitle>
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
				<PlayerItem key={p.id}>
					<PlayerName>{p.name || "anon"}</PlayerName>
					{p.id === meId && <PlayerBadge>you</PlayerBadge>}
					{p.isHost && <PlayerBadge variant="host">host</PlayerBadge>}
				</PlayerItem>
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
				<StatItem>players: {players}</StatItem>
				<StatItem>total roles: {totalRoles}</StatItem>
			</StatsRow>
			<ActionRow>
				<Button type="button" disabled={!canAssign} onClick={onAssign}>
					assign roles
				</Button>
				<Button type="button" onClick={onReset}>
					reset
				</Button>
			</ActionRow>
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

function QRCodeDisplay({ url }: { url: string }) {
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	const [showQR, setShowQR] = useState(false);

	useEffect(() => {
		if (showQR && url) {
			QRCode.toDataURL(url, {
				width: 200,
				margin: 2,
				color: {
					dark: "#000000",
					light: "#FFFFFF",
				},
			})
				.then(setQrDataUrl)
				.catch(console.error);
		}
	}, [url, showQR]);

	return (
		<QRContainer>
			<Button type="button" onClick={() => setShowQR(!showQR)}>
				{showQR ? "hide qr code" : "show qr code"}
			</Button>
			{showQR && qrDataUrl && (
				<QRCodeWrapper>
					<img src={qrDataUrl} alt="QR Code for room link" />
					<QRCodeText>scan to join</QRCodeText>
				</QRCodeWrapper>
			)}
		</QRContainer>
	);
}

export const Container = styled("main", {
	maxWidth: "960px",
	margin: "0 auto",
	padding: "1rem",
	"@media (max-width: 768px)": {
		padding: "0.75rem",
	},
});
export const Header = styled("div", {
	display: "flex",
	gap: "1rem",
	alignItems: "center",
	justifyContent: "space-between",
	marginBottom: "1rem",
	"@media (max-width: 768px)": {
		flexDirection: "column",
		gap: "0.75rem",
		alignItems: "stretch",
	},
});
export const HeaderActions = styled("div", {
	display: "flex",
	gap: "0.75rem",
	alignItems: "center",
	"@media (max-width: 768px)": {
		flexDirection: "column",
		gap: "0.75rem",
		width: "100%",
	},
});
export const Columns = styled("div", {
	display: "grid",
	gridTemplateColumns: "1fr 1fr",
	gap: "1rem",
	"@media (max-width: 768px)": {
		gridTemplateColumns: "1fr",
		gap: "0.75rem",
	},
});
export const Column = styled("div", {});
export const Button = styled("button", (_, props) => ({
	padding: "0.75rem 1.25rem",
	borderRadius: "8px",
	border: "1px solid #ddd",
	cursor: props.disabled ? "not-allowed" : "pointer",
	fontSize: "1rem",
	minHeight: "44px", // minimum touch target size
	opacity: props.disabled ? 0.6 : 1,
	"@media (max-width: 768px)": {
		padding: "1rem 1.5rem",
		fontSize: "1.1rem",
		minHeight: "48px",
	},
}));
export const Card = styled("div", {
	border: "1px solid #eee",
	borderRadius: "8px",
	padding: "1rem",
	marginBottom: "1rem",
	"@media (max-width: 768px)": {
		padding: "1.25rem",
		marginBottom: "1.25rem",
	},
});
export const SectionTitle = styled("div", {
	fontWeight: 600,
	marginBottom: "0.75rem",
	fontSize: "1.1rem",
	"@media (max-width: 768px)": {
		fontSize: "1.2rem",
		marginBottom: "1rem",
	},
});
export const ErrorText = styled("div", {
	color: "#b00",
	fontSize: "1rem",
	"@media (max-width: 768px)": {
		fontSize: "1.1rem",
	},
});

// HostPanel specific styles
export const RoleRow = styled("div", {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	marginBottom: "1rem",
	"@media (max-width: 768px)": {
		flexDirection: "column",
		gap: "0.75rem",
		alignItems: "stretch",
	},
});
export const RoleLabel = styled("div", {
	fontWeight: 500,
	fontSize: "1rem",
	minWidth: "60px",
	"@media (max-width: 768px)": {
		fontSize: "1.1rem",
		textAlign: "center",
	},
});
export const RoleControls = styled("div", {
	display: "flex",
	alignItems: "center",
	gap: "0.75rem",
	"@media (max-width: 768px)": {
		justifyContent: "center",
		gap: "1rem",
	},
});
export const RoleButton = styled("button", {
	width: "40px",
	height: "40px",
	borderRadius: "50%",
	border: "1px solid #ddd",
	backgroundColor: "white",
	cursor: "pointer",
	fontSize: "1.2rem",
	fontWeight: "bold",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	"@media (max-width: 768px)": {
		width: "48px",
		height: "48px",
		fontSize: "1.4rem",
	},
	"&:hover": {
		backgroundColor: "#f5f5f5",
	},
	"&:active": {
		backgroundColor: "#e5e5e5",
	},
});
export const RoleCount = styled("div", {
	width: "50px",
	textAlign: "center",
	fontSize: "1.2rem",
	fontWeight: "600",
	"@media (max-width: 768px)": {
		width: "60px",
		fontSize: "1.4rem",
	},
});
export const StatsRow = styled("div", {
	display: "flex",
	justifyContent: "space-between",
	marginBottom: "1rem",
	padding: "0.75rem",
	backgroundColor: "#f8f9fa",
	borderRadius: "6px",
	"@media (max-width: 768px)": {
		flexDirection: "column",
		gap: "0.5rem",
		textAlign: "center",
	},
});
export const StatItem = styled("div", {
	fontSize: "0.95rem",
	fontWeight: "500",
	"@media (max-width: 768px)": {
		fontSize: "1.05rem",
	},
});
export const ActionRow = styled("div", {
	display: "flex",
	gap: "0.75rem",
	"@media (max-width: 768px)": {
		flexDirection: "column",
		gap: "0.75rem",
	},
});

// PlayerList specific styles
export const PlayerItem = styled("div", {
	display: "flex",
	alignItems: "center",
	gap: "0.75rem",
	padding: "0.75rem 0",
	borderBottom: "1px solid #f0f0f0",
	"&:last-child": {
		borderBottom: "none",
	},
	"@media (max-width: 768px)": {
		padding: "1rem 0",
		gap: "1rem",
	},
});
export const PlayerName = styled("div", {
	fontSize: "1rem",
	fontWeight: "500",
	flex: 1,
	"@media (max-width: 768px)": {
		fontSize: "1.1rem",
	},
});
export const PlayerBadge = styled(
	"div",
	(styleProps: { variant?: "host" | "default" }) => ({
		fontSize: "0.8rem",
		padding: "0.25rem 0.5rem",
		borderRadius: "12px",
		fontWeight: "500",
		backgroundColor: styleProps.variant === "host" ? "#e3f2fd" : "#f3e5f5",
		color: styleProps.variant === "host" ? "#1976d2" : "#7b1fa2",
		"@media (max-width: 768px)": {
			fontSize: "0.9rem",
			padding: "0.35rem 0.75rem",
		},
	}),
);

// AssignedView specific styles
export const MyRoleTitle = styled("h3", {
	fontSize: "1.3rem",
	fontWeight: "600",
	marginBottom: "0.75rem",
	color: "#2c3e50",
	"@media (max-width: 768px)": {
		fontSize: "1.5rem",
		marginBottom: "1rem",
	},
});
export const MyRoleDescription = styled("p", {
	fontSize: "1rem",
	lineHeight: "1.6",
	color: "#555",
	"@media (max-width: 768px)": {
		fontSize: "1.1rem",
		lineHeight: "1.7",
	},
});
export const RoleItem = styled("div", {
	marginBottom: "1rem",
	paddingBottom: "0.75rem",
	borderBottom: "1px solid #f0f0f0",
	"&:last-child": {
		borderBottom: "none",
		marginBottom: 0,
	},
	"@media (max-width: 768px)": {
		marginBottom: "1.25rem",
		paddingBottom: "1rem",
	},
});
export const RoleItemName = styled("div", {
	fontSize: "1rem",
	fontWeight: "600",
	marginBottom: "0.5rem",
	color: "#2c3e50",
	"@media (max-width: 768px)": {
		fontSize: "1.1rem",
		marginBottom: "0.75rem",
	},
});
export const RoleItemDescription = styled("div", {
	fontSize: "0.95rem",
	lineHeight: "1.5",
	color: "#666",
	"@media (max-width: 768px)": {
		fontSize: "1.05rem",
		lineHeight: "1.6",
	},
});
export const ConnectingText = styled("p", {
	fontSize: "1.2rem",
	textAlign: "center",
	color: "#666",
	marginTop: "2rem",
	"@media (max-width: 768px)": {
		fontSize: "1.3rem",
		marginTop: "3rem",
	},
});

// QR Code specific styles
export const QRContainer = styled("div", {
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	gap: "0.75rem",
});
export const QRCodeWrapper = styled("div", {
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	gap: "0.5rem",
	padding: "1rem",
	backgroundColor: "#f8f9fa",
	borderRadius: "8px",
	border: "1px solid #eee",
	"@media (max-width: 768px)": {
		padding: "1.25rem",
	},
});
export const QRCodeText = styled("div", {
	fontSize: "0.9rem",
	color: "#666",
	fontWeight: "500",
	"@media (max-width: 768px)": {
		fontSize: "1rem",
	},
});

export const HomeTitle = styled("h1", {
	fontSize: "3rem",
	fontWeight: "700",
	textAlign: "center",
	marginBottom: "2rem",
	color: "#2c3e50",
	"@media (max-width: 768px)": {
		fontSize: "2.5rem",
		marginBottom: "2.5rem",
	},
});

export const HomeButton = styled("button", {
	padding: "1.25rem 2.5rem",
	borderRadius: "12px",
	border: "none",
	backgroundColor: "#3498db",
	color: "white",
	cursor: "pointer",
	fontSize: "1.2rem",
	fontWeight: "600",
	minHeight: "56px",
	width: "100%",
	maxWidth: "300px",
	margin: "0 auto",
	display: "block",
	"@media (max-width: 768px)": {
		padding: "1.5rem 3rem",
		fontSize: "1.3rem",
		minHeight: "64px",
		maxWidth: "100%",
	},
	"&:hover": {
		backgroundColor: "#2980b9",
	},
	"&:active": {
		backgroundColor: "#21618c",
	},
});
