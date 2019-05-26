import {useState} from 'react';
import url from './Settings'

export interface Drag {
	svgPiece: SVGSVGElement,
	originMouseX: number,
	originMouseY: number,
	originPieceX: number,
	originPieceY: number,
	moveFrom: string
}

export interface Board {
	svg: SVGSVGElement | null;
	svgPoint: any;
	pieces: HTMLElement[];
	dragging: Drag | null;
	moveFrom: string
}

interface ServiceInit {
	status: 'init';
}

interface ServiceLoading {
	status: 'loading';
}

interface ServiceLoaded<T> {
	status: 'loaded';
	payload: string;
}

interface ServiceError {
	status: 'error';
	error: Error;
}

type Service<T> =
	| ServiceInit
	| ServiceLoading
	| ServiceLoaded<T>
	| ServiceError;


export type StringDict = { [key: string]: any }


/**
 * Represents the calling to backend
 * */
const useBoardByUrlService = () => {
	// Result here refers to a board fetch request
	const [service, setService] = useState<Service<string>>({
		status: 'init'
	});


	/**
	 * Helper function to perform a fetch call to backend with given dictionary.
	 * Must supply endpoint, request dict and resolve function,
	 * reject function is optional but will always setService to error.
	 */
	const doFetch = (endpoint: string, requestDict: { [key: string]: any },
	                 resolve: (response: StringDict) => void, reject?: (response: StringDict) => void) => {
		console.log('doFetch ' + endpoint);
		const reject_func = (reject) ? reject : () => {
		};
		fetch(url + '/' + endpoint, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json"
			},
			body: JSON.stringify(requestDict)
		})
			.then(response => response.json())
			.then(response => {
				resolve(response);
				setService({status: 'loaded', payload: ''})
			})
			.catch(error => {
				setService({status: 'error', error});
				console.log('Fetch error on ' + endpoint + ', us sending:');
				console.log(requestDict);
				console.log(error);
				reject_func(error);
			})

	};

	const initialBoardState: Board = {svg: null, svgPoint: null, pieces: [], dragging: null, moveFrom: '??'};
	const [board, setBoard] = useState<Board>(initialBoardState);
	return {service, board, setBoard, doFetch};
};

export {useBoardByUrlService};




