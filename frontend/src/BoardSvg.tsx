import {StringDict, useBoardByUrlService} from './BoardService'
import React, {useState} from "react";

export interface Drag {
	svgPiece: SVGSVGElement,
	originMouseX: number,
	originMouseY: number,
	originPieceX: number,
	originPieceY: number,
	moveFrom: string
}

interface SvgBoardProps {
	svgobj: Element | null;
}

type SquareDict = { [key: number]: string };

// Mapping coordinates to square and file names
const files: SquareDict = [0, 1, 2, 3, 4, 5, 6, 7].reduce(function (obj: SquareDict, x) {
	obj[20 + 45 * x] = String.fromCharCode(97 + x);
	return obj;
}, {});
// The 20+45*i numbers relate to the SVG images, it seems to work
const ranks: SquareDict = [0, 1, 2, 3, 4, 5, 6, 7].reduce((obj: SquareDict, x) => {
	obj[20 + 45 * (7 - x)] = String(x + 1);
	return obj;
}, {});

/**
 * Helper function to parse an SVG object for its transform property,
 * return a pair of coordinates or [0, 0] (which is an invalid piece position)
 */
const readTransform = (elem: Element) => {
	let attr = elem.getAttribute('transform');
	if (attr) {
		let coord: string = attr.split('(')[1].split(')')[0];
		let pieces: string[] = coord.split(', ');
		let x: number = +pieces[0];
		let y: number = +pieces[1];
		return [x, y];
	}
	return [0, 0];

};

/**
 * Helper function to set the transform property of an SVG object,
 * effectively moving it.
 *
 */
function modifyTransform(piece: SVGSVGElement, transX: number, transY: number) {
	let transstr = 'translate(' + transX + ', ' + transY + ')';
	piece.setAttribute('transform', transstr);
}

const getPiecePosition: (elem: SVGSVGElement) => [number, number] = (elem) => {
	// A click on a piece icon will contain its position transform
	let trans = elem.getAttribute('transform');
	let [x, y] = readTransform(elem);
	let rect = elem.getBoundingClientRect();
	x += rect.width / 2;
	y += rect.height / 2;
	x = 20 + 45 * Math.floor((x - 20) / 45);
	y = 20 + 45 * Math.floor((y - 20) / 45);
	return [x, y]

};

const adjustPiecePosition = (elem: SVGSVGElement) => {
	let [x, y] = getTransformPosition(elem);
	modifyTransform(elem, x, y);
};

const getTransformPosition: (elem: SVGSVGElement) => [number, number] = (elem) => {
	let [x, y] = readTransform(elem);
	let rect = elem.getBoundingClientRect();
	x += rect.width / 2;
	y += rect.height / 2;
	x = 20 + 45 * Math.floor((x - 20) / 45);
	y = 20 + 45 * Math.floor((y - 20) / 45);
	return [x, y];
};


/**
 * Returns the square as a string from an svg target (square or piece)
 * @param elem
 */
const findSquareFromSvgTarget = (elem: SVGSVGElement) => {
	if ('transform' in elem.attributes) {
		let [x, y] = getTransformPosition(elem);
		let square: string = files[x] + ranks[y];
		return square;
	}
	if ('class' in elem.attributes) {
		let rect_class = elem.getAttribute('class');
		if (rect_class) {
			let pieces: string[] = rect_class.split(' ');
			// Square name is in last class name, e.g. 'square light c4'
			let square = pieces.pop();
			if (square)
				return square;
		}
	}
	// Default value
	return '??';
};

/**
 * The response from the server when passing a move
 */
interface IMoveResponse {
	success: boolean,
	suggestions: string[]
}

/**
 * The view of the chess board, containing SvgBoard for rendering SVG board,
 * mouse dragging functions, and loading a new setup onto the board through loadBoard.
 */
const BoardViewer: React.FC<{}> = () => {
	const {service, board, doFetch} = useBoardByUrlService();
	let drag: Drag | null = null;
	const updateSvgArrows = (resp: IMoveResponse) => {
		// TODO implement
	};

	const handleFetchMoveResponse = (squareUpped: string, resp: IMoveResponse) => {
		if ('success' in resp) {
			if (resp.success) {
				if (drag) {
					console.log('Yes this move is a success');
					// "Capture" a piece if it is located on our move destination
					// TODO let backend specify manipulation of other pieces
					board.pieces.forEach((piece) => {
						if (piece.parentNode && piece.getAttribute('onSquare') === squareUpped) {
							piece.parentNode.removeChild(piece);
						}
					});
					// Update the moved piece's position
					drag.svgPiece.setAttribute('onSquare', squareUpped);
					// Todo call arrows with suggestions
					if ('suggestions' in resp) {
						console.log('It here');
						console.log(resp.suggestions)
					}

				}
			} else {
				if (drag) {
					console.log('Move rejected! Resetting piece.');
					modifyTransform(drag.svgPiece, drag.originPieceX, drag.originPieceY);
				}
			}
		}
	};

	/**
	 * Finds the clicked piece's square from mouse event.
	 * Also handles click in square (potentially without piece)
	 * @param evt: mouse event from onMouseDown
	 */
	const onBoardMouseDown: { (evt: Event): void } = (evt) => {
		let m = (evt as unknown) as React.MouseEvent;
		let elem = evt.target as SVGSVGElement;
		let squareClicked: string = findSquareFromSvgTarget(elem);

		let [pieceX, pieceY] = readTransform(elem);
		let piece;
		if (board && pieceX === 0 && pieceY === 0) {
			// Find the piece which is on the clicked square
			board.pieces.forEach((item) => {
				if (item.getAttribute('onSquare') === squareClicked) {
					piece = item;
					[pieceX, pieceY] = readTransform(piece);
				}

			})
		} else if (elem.nodeName === 'rect') {
			board.pieces.forEach((item) => {
				if (item.getAttribute('onSquare') === squareClicked) {
					piece = item;
				}
			});
		} else {
			// Edge cases handled, the clicked svg object is assumed to be the piece
			piece = (evt.target as unknown) as SVGSVGElement;
		}
		if (piece) {
			drag = {
				svgPiece: piece, originMouseX: m.screenX,
				originMouseY: m.screenY, originPieceX: pieceX, originPieceY: pieceY, moveFrom: squareClicked
			};
		}
	};

	/**
	 * SVG transformations when dragging a piece on the board
	 * @param evt: mouse event from onMouseMove
	 */
	const onBoardMouseMove = (evt: Event) => {
		if (drag != null) {
			let m = (evt as unknown) as React.MouseEvent;
			let piece: SVGSVGElement = drag.svgPiece;
			if (board.svg) {
				let pt = board.svg.createSVGPoint();
				pt.x = m.clientX;
				pt.y = m.clientY;
				let ctm = board.svg.getScreenCTM();
				if (ctm) {
					let svgP = pt.matrixTransform(ctm.inverse());
					let rect = piece.getBoundingClientRect();
					svgP.x -= rect.width / 2;
					svgP.y -= rect.height / 2;
					modifyTransform(piece, svgP.x, svgP.y);
				}
			}
		}
	};

	/**
	 * Concatenates squares clicked and released to a move e.g. 'e2e4',
	 * sends move over fetch, updates board from response
	 * @param evt: mouse event from onMouseUp
	 */
	const onBoardMouseUp = (evt: Event) => {
		let elem = evt.target as SVGSVGElement;
		let squareUpped: string = findSquareFromSvgTarget(elem);
		if (drag) {
			console.log('In drag:');
			console.log(drag.originPieceX);
			let move: string = drag.moveFrom + squareUpped;
			console.log(move);

			doFetch('move', {move: move}, (resp: IMoveResponse) => {
				handleFetchMoveResponse(squareUpped, resp);
				adjustPiecePosition(elem);
				drag = null;
			}, () => {
				// This fail means server error, not 'illegal move'
				drag = null;

			});
		}
	};


	type LoadBoardDict = { empty: boolean, moves: string };
	/**
	 * Fetches the backend for a board and prepares the SVG object by
	 * adding mouse handlers and reordering elements for rendering purposes.
	 * @param props
	 */
	const loadBoard = (props: LoadBoardDict) => {
		doFetch('svg', {}, (resp: StringDict) => {
			if ('svg' in resp) {
				let doc = new DOMParser().parseFromString(resp['svg'], 'application/xml');
				let givenSvg = doc.documentElement as HTMLElement;
				let tags: NodeList = givenSvg.childNodes;
				let pieces: HTMLElement[] = [];
				let others: HTMLElement[] = [];
				let head: SVGSVGElement = givenSvg.cloneNode() as SVGSVGElement;
				tags.forEach((value: Node, key, parent) => {
					let elem = value as HTMLElement;
					if (value.nodeName === 'rect') {
						let square: string = elem.classList[elem.classList.length - 1];
						if (value.nextSibling && value.nextSibling.nodeName === 'use') {
							let piece = value.nextSibling as HTMLElement;
							piece.setAttribute('onSquare', square);
							piece.addEventListener('mousedown', onBoardMouseDown, false);
							piece.addEventListener('mouseup', onBoardMouseUp, false);
							piece.addEventListener('mousemove', onBoardMouseMove, false);
							pieces = pieces.concat(piece);
						}
						elem.addEventListener('mousedown', onBoardMouseDown, false);

					}
					others = others.concat(elem);
				});
				let newSvg: SVGSVGElement = head;
				newSvg.addEventListener('mousemove', onBoardMouseMove, false);
				newSvg.addEventListener('mouseleave', onBoardMouseUp, false);
				others.forEach((item) => {
					newSvg.appendChild(item);
				});
				// If the pieces aren't the last objects to be drawn,
				// dragging a piece onto a piece "higher up" will cause the piece
				// to disappear, because the square renders after it.
				pieces.forEach((item) => {
					newSvg.appendChild(item);
				});
				board.svg = newSvg;
				board.pieces = pieces;
			}
		})

	};

	// Initial empty board fetch for componentDidMount to inject
	if (!board.svg) {
		loadBoard({empty: true, moves: ''});
	}

	/**
	 * The SVG viewer injects a loaded SVG board through the (real) DOM.
	 * To avoid re-renders, this Component uses componentDidMount to only inject once.
	 */
	class SvgBoard extends React.Component<SvgBoardProps> {
		constructor(props: SvgBoardProps) {
			super(props);
		}

		appendSvg() {
			console.log('Run');
			if (this.props.svgobj) {
				let divElem = document.getElementById('boardHolder');
				if (divElem && board.svg) {
					divElem.appendChild(board.svg)
				}
			}

		};

		componentDidUpdate(): void {
			this.appendSvg();
		}

		componentDidMount = this.componentDidUpdate;

		render() {
			return (
				<div className='board-container' id={'boardHolder'}></div>
			)
		}
	}

	return (
		<div>
			<SvgBoard svgobj={board.svg}/>
			{(service.status === 'loading' || service.status === 'init') &&
			<div>Loading</div>
			}
			{service.status === 'loaded' && (
				<div>Loaded</div>
			)}
			{service.status === 'error' && (
				<div>Yikes! </div>
			)}

		</div>
	);
};

export default BoardViewer;

