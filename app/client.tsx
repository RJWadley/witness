import "./styles.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "./components/Home";
import { Room } from "./components/Room";

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

const root = document.getElementById("app");
if (root) createRoot(root).render(<App />);
