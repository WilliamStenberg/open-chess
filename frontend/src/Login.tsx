import React, {useState} from "react";
import {StringDict, useBoardByUrlService} from "./BoardService";
import {getCookie, setCookie} from "./Cookies";
import {Button, Input, Message, Modal, Title} from "rbx";

const Login: React.FC<{}> = () => {
	const [text, setText] = useState<string>('');
	const [active, setActive] = useState<boolean>(true);
	const [error, setError] = useState<boolean>(false);
	const [warning, setWarning] = useState<boolean>(false);
	const {doFetch} = useBoardByUrlService();

	const handleSubmit = () => {
		console.log(text);
		doFetch('auth', {name: text}, (resp: StringDict) => {
			if (resp.key) {
				setActive(false);
				// Deliver key
				setCookie('key', resp.key);
			} else {
				setWarning(true);

			}
		}, (error) => {
			setError(true);
		});

	};

	let warningMsg = <Message color="warning">Null key, did we drop our cookie?</Message>;
	let errorMsg = <Message color="danger">Wait, is this thing on?</Message>;


	return (
		<Modal active={(!getCookie('key')) && active}>
			<Modal.Background/>
			<Modal.Card>
				<Modal.Card.Head>
					<Modal.Card.Title>Hi!</Modal.Card.Title>
				</Modal.Card.Head>
				<Modal.Card.Body>
					<Title>What's your name?</Title>
					{(warning) ? warningMsg : null}
					{(error) ? errorMsg : null}
					<Input size="large" type='text' value={text}
					       onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)}/>
				</Modal.Card.Body>
				<Modal.Card.Foot>
					<Button color="success" onClick={handleSubmit}>Enter</Button>
				</Modal.Card.Foot>
			</Modal.Card>

		</Modal>
	);
};
export default Login;