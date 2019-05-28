import {StringDict, useBoardByUrlService} from './BoardService'
import React from 'react';
import {arrowColor} from './Settings';

type Coord = [number, number];
type CoordPair = [Coord, Coord];

const SQUARE_SIZE = 45;
const SVG_OFFSET = 20;

export interface Drag {
	svgPiece: SVGSVGElement,
	originMouseX: number,
	originMouseY: number,
	originPieceX: number,
	originPieceY: number,
	moveFrom: string
}

type Suggestion = { move: string, opacity: number, label: string };
/**
 * The response from the server when passing a move
 */
interface IMoveResponse {
	success: boolean,
	suggestions: Suggestion[]
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

const squareToCoordinate: (_: string) => Coord = (square: string) => {
	let x = 0, y = 0;
	for (let key of Object.keys(files)) {
		if (files[+key] === square[0]) {
			x = +key;
		}
	}
	for (let key of Object.keys(ranks)) {
		if (ranks[+key] === square[1]) {
			y = +key;
		}
	}
	return [x, y];
};

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

const adjustPiecePosition = (elem: SVGSVGElement) => {
	let [x, y] = getTransformPosition(elem);
	modifyTransform(elem, x, y);
};

const getTransformPosition: (elem: SVGSVGElement) => Coord = (elem) => {
	let [x, y] = readTransform(elem);
	let rect = elem.getBoundingClientRect();
	x += rect.width / 2;
	y += rect.height / 2;
	x = SVG_OFFSET + SQUARE_SIZE * Math.floor((x - SVG_OFFSET) / SQUARE_SIZE);
	y = SVG_OFFSET + SQUARE_SIZE * Math.floor((y - SVG_OFFSET) / SQUARE_SIZE);
	return [x, y];
};


/**
 * Returns the square as a string from an svg target (square or piece)
 * @param elem
 */
const findSquareFromSvgTarget = (elem: SVGSVGElement) => {
	if ('transform' in elem.attributes) {
		let [x, y] = getTransformPosition(elem);
		return files[x] + ranks[y];
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


const stringMoveToCoordinates: (_: string) => CoordPair = (item: string) => {
	let fromSquare = item.slice(0, 2), toSquare = item.slice(2, 4);
	return [squareToCoordinate(fromSquare), squareToCoordinate(toSquare)];
};

/**
 * The view of the chess board, containing SvgBoard for rendering SVG board,
 * mouse dragging functions, and loading a new setup onto the board through loadBoard.
 */
const BoardViewer: React.FC<{}> = () => {
	const {service, board, doFetch} = useBoardByUrlService();
	let drag: Drag | null = null;

	/**
	 * From a given coordinate pair (parsed from a move),
	 * create an SVG object for an arrow having
	 */
	const constructArrow: (cp: CoordPair, opacity: number, label: string) => SVGGElement = (coordPair, opacity, label) => {
		let doc: SVGLineElement = document.createElementNS("http://www.w3.org/2000/svg",
			"line");
		// Adjusting positions for center-square coordinates
		let x1 = coordPair[0][0] + SQUARE_SIZE / 2;
		let x2 = coordPair[1][0] + SQUARE_SIZE / 2;
		let y1 = coordPair[0][1] + SQUARE_SIZE / 2;
		let y2 = coordPair[1][1] + SQUARE_SIZE / 2;

		x2 -= Math.min(0.1 * (x2 - x1), SQUARE_SIZE / 4);
		y2 -= Math.min(0.1 * (y2 - y1), SQUARE_SIZE / 4);


		doc.setAttribute("x1", "" + x1);
		doc.setAttribute("y1", "" + y1);
		doc.setAttribute("x2", "" + x2);
		doc.setAttribute("y2", "" + y2);
		doc.setAttribute("stroke", arrowColor);
		doc.setAttribute("stroke-width", "7");
		doc.setAttribute("marker-end", "url(#arrowhead)");
		doc.setAttribute("opacity", "" + opacity);
		doc.addEventListener("click", () => {
			alert('Arrow click!')
		}, false);

		let g: SVGGElement = document.createElementNS("http://www.w3.org/2000/svg",
			'g');
		g.setAttribute('opacity', '0.7');
		g.appendChild(doc);
		return g;

	};

	/**
	 * Clears all arrows on board and feeds fetched suggested move list
	 * to constructArrow.
	 */
	const updateSvgArrows = (resp: IMoveResponse) => {
		if (board.svg) {
			let toBeRemoved: Node[] = [];
			// Select first piece, to insert before it
			let firstPiece = ((svg) => {
				let found = null;
				for (let [, tag] of svg.childNodes.entries()) {
					if (!found && tag.nodeName === 'use') {
						found = tag;
					} else if (tag.nodeName === 'g') {
						// Remove 'g' elements containing arrows
						toBeRemoved = toBeRemoved.concat(tag);
					}

				}
				return found;
			})(board.svg);
			toBeRemoved.forEach(item => board.svg && board.svg.removeChild(item));
			resp.suggestions.forEach((item: Suggestion) => {
				let coordPair = stringMoveToCoordinates(item.move);
				console.log('Received ' + item.opacity);
				// Adjusting given move popularity for arrow opacity
				let threshOpacity = Math.max(0.2, Math.min(0.8, item.opacity + 0.1));
				let arrowForm = constructArrow(coordPair, threshOpacity, item.label);
				board.svg && board.svg.insertBefore(arrowForm, firstPiece);
			});


		} else {
			console.log('WEIRD: update arrows when no svg?')
		}
	};

	const handleFetchMoveResponse = (squareUpped: string, resp: IMoveResponse) => {
		if ('success' in resp) {
			if (resp.success) {
				if (drag) {
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
					updateSvgArrows(resp);


				}
			} else {

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
			let move: string = drag.moveFrom + squareUpped;

			doFetch('move', {move: move}, (resp: IMoveResponse) => {
				handleFetchMoveResponse(squareUpped, resp);
				// Snapping piece to grid
				adjustPiecePosition(elem);
				drag = null;
			}, () => {
				// This fail means server error, or 'illegal move'
				if (drag) {
					console.log('Move rejected! Resetting piece.');
					modifyTransform(drag.svgPiece, drag.originPieceX, drag.originPieceY);
				}
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
				const doc = new DOMParser().parseFromString(resp['svg'], 'application/xml');
				const givenSvg = doc.documentElement as HTMLElement;
				const head: SVGSVGElement = givenSvg.cloneNode() as SVGSVGElement;
				let tags: NodeList = givenSvg.childNodes;
				let squares: HTMLElement[] = [];
				let pieces: HTMLElement[] = [];
				let defs: HTMLElement = givenSvg;
				let others: HTMLElement[] = [];
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
						squares = squares.concat(elem);
						elem.addEventListener('mousedown', onBoardMouseDown, false);

					} else if (value.nodeName === 'defs') {
						defs = elem;
					} else {
						others = others.concat(elem);
					}
				});

				// Adding arrow support
				if (defs && defs.firstChild) {
					// Inserts the arrow form into <defs> tag
					let arrowForm = document.createElementNS('http://www.w3.org/2000/svg',
						'marker');
					arrowForm.setAttribute('id', 'arrowhead');
					arrowForm.setAttribute('markerWidth', '3');
					arrowForm.setAttribute('markerHeight', '4');
					arrowForm.setAttribute('refX', '1.5');
					arrowForm.setAttribute('refY', '2');
					arrowForm.setAttribute('orient', 'auto');
					arrowForm.setAttribute('fill', arrowColor);

					let poly = document.createElementNS('http://www.w3.org/2000/svg',
						'polygon');
					poly.setAttribute('points', '0 0, 3 2, 0 4');
					arrowForm.appendChild(poly);

					defs.appendChild(arrowForm);
				}

				let newSvg: SVGSVGElement = head;
				newSvg.addEventListener('mousemove', onBoardMouseMove, false);
				newSvg.addEventListener('mouseleave', onBoardMouseUp, false);
				newSvg.appendChild(defs);
				others.forEach((item) => {
					newSvg.appendChild(item);
				});
				squares.forEach((item) => {
					newSvg.appendChild(item)
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
		setTimeout(() => {
			loadBoard({empty: true, moves: ''});
		}, 500);
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

