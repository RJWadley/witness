export function getClientId() {
	const k = "clientId";
	const v = localStorage.getItem(k);
	if (v) return v;
	const n = crypto.randomUUID();
	localStorage.setItem(k, n);
	return n;
}
