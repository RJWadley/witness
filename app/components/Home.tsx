export function Home() {
	const createGame = () => {
		const id = crypto.randomUUID().split("-")[0];
		window.location.hash = `/${id}`;
	};
	return (
		<Container>
			<HomeTitle>witness</HomeTitle>
			<HomeButton type="button" onClick={createGame}>
				create game
			</HomeButton>
		</Container>
	);
}

import { Container, HomeButton, HomeTitle } from "../styles/styles";
