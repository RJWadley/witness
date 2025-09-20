import z from "zod";

// ----- roles & game types -----

export const roleKeys = ["A", "B", "C", "D"] as const;
export type RoleKey = (typeof roleKeys)[number];

export type RoleSpec = {
	key: RoleKey;
	name: string;
	description: string;
	affects: {
		self?: boolean;
		targetsRoleKeys?: RoleKey[];
		global?: boolean;
	};
};

export type Player = {
	id: string; // stable clientId
	name: string;
	ready: boolean;
	isHost: boolean;
	joinedAt: number;
	roleKey?: RoleKey;
};

export type RoleConfig = Record<RoleKey, number>;

export type GameStatus = "lobby" | "assigned";

export type GameState = {
	roomId: string;
	hostId: string | null;
	status: GameStatus;
	players: Record<string, Player>; // keyed by player.id (clientId)
	roleConfig: RoleConfig;
	assignedAt?: number;
	rolesCatalog: RoleSpec[]; // static per server; included for client convenience
};

export const rolesCatalog: RoleSpec[] = [
	{
		key: "A",
		name: "Role A",
		description:
			"you primarily act on yourself. placeholder description for v1.",
		affects: { self: true },
	},
	{
		key: "B",
		name: "Role B",
		description:
			"you target players with role A. placeholder description for v1.",
		affects: { targetsRoleKeys: ["A"] },
	},
	{
		key: "C",
		name: "Role C",
		description: "you have a global effect. placeholder description for v1.",
		affects: { global: true },
	},
	{
		key: "D",
		name: "Role D",
		description:
			"you target players with roles B and C. placeholder description for v1.",
		affects: { targetsRoleKeys: ["B", "C"] },
	},
];

export const defaultRoleConfig: RoleConfig = roleKeys.reduce((acc, key) => {
	acc[key] = 0;
	return acc;
}, {} as RoleConfig);

// ----- utility helpers -----

export function buildDeck(config: RoleConfig): RoleKey[] {
	const deck: RoleKey[] = [];
	for (const key of roleKeys) {
		const count = config[key] ?? 0;
		for (let i = 0; i < count; i++) deck.push(key);
	}
	return deck;
}

export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
	const arr = [...list];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

export function computeImpactScore(
	viewerRoleKey: RoleKey | undefined,
	role: RoleSpec,
): number {
	let score = 0;
	if (role.affects.global) score += 1;
	if (role.affects.self && viewerRoleKey && role.key === viewerRoleKey)
		score += 2;
	if (
		viewerRoleKey &&
		role.affects.targetsRoleKeys &&
		role.affects.targetsRoleKeys.includes(viewerRoleKey)
	) {
		score += 3;
	}
	return score;
}

// ----- messaging schemas -----

const roleKeySchema = z.union([
	z.literal("A"),
	z.literal("B"),
	z.literal("C"),
	z.literal("D"),
]);

export const clientMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("join"),
		name: z.string().max(64),
		clientId: z.string().min(1),
	}),
	z.object({ type: z.literal("setName"), name: z.string().max(64) }),
	z.object({ type: z.literal("setReady"), ready: z.boolean() }),
	z.object({
		type: z.literal("setRoleCount"),
		roleKey: roleKeySchema,
		count: z.number().int().min(0).max(99),
	}),
	z.object({ type: z.literal("assignRoles") }),
	z.object({ type: z.literal("reset") }),
	z.object({ type: z.literal("requestState") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("state"), state: z.any() }),
	z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function isEveryoneReady(players: Record<string, Player>): boolean {
	const ids = Object.keys(players);
	if (ids.length === 0) return false;
	return ids.every((id) => players[id].ready);
}

export function totalRoles(config: RoleConfig): number {
	return roleKeys.reduce((sum, key) => sum + (config[key] ?? 0), 0);
}
