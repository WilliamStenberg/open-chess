import {GameModel, Square, Piece, StringDict, useBoardByUrlService, TPoint, svgPoint} from './BoardService'
import React from 'react';
import {arrowColor} from './Settings';

type CoordPair = [TPoint, TPoint];




type Suggestion = { move: string, opacity: number, label: string };
/**
 * The response from the server when passing a move
 */
interface IMoveResponse {
	success: boolean,
	suggestions: Suggestion[]
	updates: string[],
	revert: string[]
}

interface SvgBoardProps {
	svgobj: Element | null;
}

/**
 * The view of the chess board, containing SvgBoard for rendering SVG board,
 * mouse dragging functions, and loading a new setup onto the board through loadBoard.
 */
const BoardViewer: React.FC<{}> = () => {
	const {service, board, doFetch} = useBoardByUrlService();

	/**
	 * From a given coordinate pair (parsed from a move),
	 * create an SVG object for an arrow having
	 */
	const constructArrow: (cp: CoordPair, opacity: number, label: string) => SVGGElement = (coordPair, opacity, label) => {
		let doc: SVGLineElement = document.createElementNS("http://www.w3.org/2000/svg",
			"line");
		// Adjusting positions for center-square coordinates
		let x1 = coordPair[0].x + GameModel.SVG_SIZE / 2;
		let x2 = coordPair[1].x + GameModel.SVG_SIZE / 2;
		let y1 = coordPair[0].y + GameModel.SVG_SIZE / 2;
		let y2 = coordPair[1].y + GameModel.SVG_SIZE / 2;

		//x2 -= Math.min(0.1 * (x2 - x1), GameModel.SVG_SIZE / 4);
		//y2 -= Math.min(0.1 * (y2 - y1), GameModel.SVG_SIZE / 4);


		doc.setAttribute("x1", "" + x1);
		doc.setAttribute("y1", "" + y1);
		doc.setAttribute("x2", "" + x2);
		doc.setAttribute("y2", "" + y2);
		doc.setAttribute("stroke", arrowColor);
		doc.setAttribute("stroke-width", "7");
		doc.setAttribute("marker-end", "url(#arrowhead)");
		doc.setAttribute("opacity", "" + opacity);
		doc.addEventListener("mouseenter", () => {
			doc.setAttribute('opacity', "" + Math.min(opacity + 0.2, 1));
		}, false);
		doc.addEventListener("mouseleave", () => {
			doc.setAttribute('opacity', "" + opacity);
		}, false);

		// Wrapping in a g tag for opacity to take effect on the line marker (arrow head)
		let g: SVGGElement = document.createElementNS("http://www.w3.org/2000/svg",
			'g');
		g.setAttribute('opacity', "" + opacity);
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
				let start = item.move.slice(0, 2), end = item.move.slice(2, 4);
				let from_square = board.squares.find(p => p.squareName() === start);
				let to_square = board.squares.find(p => p.squareName() === end);
				if (from_square && to_square) {
					let threshOpacity = Math.max(0.2, Math.min(0.8, item.opacity + 0.1));
					let arrowForm = constructArrow([from_square.getPosition(), to_square.getPosition()],
						threshOpacity, item.label);
					board.svg && board.svg.insertBefore(arrowForm, firstPiece);
				}
			});
		} else {
			console.error('update arrows when no svg?')
		}
	};

	const executeFetchUpdates = (commands: string[]) => {
		// TODO: Could be optimized by a single loop over board pieces?
		commands.forEach((move) => {
			let start = move.slice(0, 2), end = move.slice(2, 4);
			if (start === '??') {
				// Fetch the object from the remove queue
				let piece = board.pieces.find(p => p.isOnBoard() && p.squareName() === end);
				let square = board.squares.find(p => p.square === end);
				if (piece && square) {
					piece.placeOn(square);
				} else {
					console.error('Could not resurrect piece');
				}
			} else if (end === '??') {
				let p = board.pieces.find(p => p.isOnBoard() && p.squareName() === start);
				if (p) {
					p.remove();
				} else {
					console.error('malformed command?', move);
				}
			} else { // Moving pieces
				let piece = board.pieces.find(p => p.isOnBoard() && p.squareName() === start);
				let targetSquare = board.squares.find(p => p.squareName() === end);
				piece && targetSquare && piece.placeOn(targetSquare);
			}
		})
	};

	const handleFetchMoveResponse = (squareUpped: string, resp: IMoveResponse) => {
		executeFetchUpdates(resp.updates);
		console.log(resp.updates);
		// Todo call arrows with suggestions
		board.removeStack.push(resp.revert);
		updateSvgArrows(resp);

	};

	const onPieceMouseDown: { (pc: Piece, evt: Event): void } = (pc, _) => {
		GameModel.drag = {piece: pc, start: pc.occupying};
	};



	/**
	 * SVG transformations when dragging a piece on the board
	 */
	const onBoardMouseMove = (square: Square, evt: Event) => {
		if (GameModel.drag && board.svg) {
			let m = (evt as unknown) as React.MouseEvent;
			let piece = GameModel.drag.piece;
			piece.moveTo(svgPoint(board.svg, {
				x: m.clientX - GameModel.SQUARE_SIZE / 2,
				y: m.clientY - GameModel.SQUARE_SIZE / 2
			}));

		}
	};

	/**
	 * Concatenates squares clicked and released to a move e.g. 'e2e4',
	 * sends move over fetch, updates board from response
	 * @param evt: mouse event from onMouseUp
	 */
	const onBoardMouseUp = (pieceUpped: Piece, _: Event) => {
		let drag = GameModel.drag;
		if (drag) {
			let rank = Math.floor(pieceUpped.point.y / GameModel.SVG_SIZE);
			rank = Math.min(Math.max(0, rank), 7);
			let file = Math.floor(pieceUpped.point.x / GameModel.SVG_SIZE);
			file = Math.min(Math.max(0, file), 7);

			let square = 'abcdefgh'.charAt(file) + '87654321'.charAt(rank);
			let move: string = drag.start.squareName() + square;
			doFetch('move', {move: move}, (resp: IMoveResponse) => {
				handleFetchMoveResponse(square, resp);
				GameModel.drag = null;
			}, () => {
				// This fail means server error, or 'illegal move'
				if (drag) {
					// Move rejected! Resetting piece
					drag.piece.placeOn(drag.start);
				}
				GameModel.drag = null;

			});
		}
	};


	function createArrow(): SVGElement {
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
		return arrowForm;
	}

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
				let squares: Square[] = [];
				let pieces: Piece[] = [];
				let defs: HTMLElement = givenSvg;
				let others: HTMLElement[] = [];
				tags.forEach((value: Node, key, parent) => {
					let elem = value as HTMLElement;
					let squareName: string = elem.classList[elem.classList.length - 1];
					let square = new Square(elem, squareName);
					if (value.nodeName === 'rect') {
						if (value.nextSibling && value.nextSibling.nodeName === 'use') {
							let pc = new Piece(value.nextSibling as HTMLElement, 'piece', square);
							pc.registerMouseHandlers(onPieceMouseDown, onBoardMouseUp, onBoardMouseMove);
							pieces = pieces.concat(pc);
						}
						square.registerMouseHandlers(() => {
							}, () => {
							},
							onBoardMouseMove);
						squares = squares.concat(square);

					} else if (value.nodeName === 'defs') {
						defs = elem;
					} else {
						others = others.concat(elem);
					}
				});

				// Adding arrow support
				if (defs && defs.firstChild) {
					// Inserts the arrow form into <defs> tag
					defs.appendChild(createArrow());
				}

				let newSvg: SVGSVGElement = head;
				newSvg.appendChild(defs);
				others.forEach((item) => {
					newSvg.appendChild(item);
				});
				squares.forEach((item) => {
					newSvg.appendChild(item.domPiece);
				});
				// If the pieces aren't the last objects to be drawn,
				// dragging a piece onto a piece "higher up" will cause the piece
				// to disappear, because the square renders after it.
				pieces.forEach((item) => {
					newSvg.appendChild(item.domPiece);
				});
				board.svg = newSvg;
				board.pieces = pieces;
				board.squares = squares;
			}
		})

	};


	/**
	 * The SVG viewer injects a loaded SVG board through the (real) DOM.
	 * To avoid re-renders, this Component uses componentDidMount to only inject once.
	 */
	class SvgBoard extends React.Component<SvgBoardProps> {
		constructor(props: SvgBoardProps) {
			super(props);

			// Initial empty board fetch for componentDidMount to inject
			if (!board.svg) {
				setTimeout(() => {
					loadBoard({empty: true, moves: ''});
				}, 500);
			}
		}

		appendSvg() {
			if (this.props.svgobj) {
				let divElem = document.getElementById('boardHolder');
				if (divElem && board.svg) {
					divElem.appendChild(board.svg);
					let a8 = board.squares.find(s => s.squareName() === 'a8');
					let parentRect = (a8 && a8.domPiece.parentElement) ? a8.domPiece.parentElement.getBoundingClientRect() : null;
					let squareRect = (a8) ? a8.domPiece.getBoundingClientRect() : null;
					if (parentRect && squareRect && a8) {
						GameModel.SVG_OFFSET = (squareRect.left - parentRect.left);
						GameModel.SQUARE_SIZE = squareRect.width;
						let a = (a8.domPiece as unknown) as SVGSVGElement;
						GameModel.SVG_SIZE = a.width.baseVal.value;

						for (let s of board.squares) {
							let x = 'abcdefgh'.indexOf(s.square[0]);
							let y = 8 - parseInt(s.square[1], 10);
							let pt = {
								x: (GameModel.SQUARE_SIZE * (x + 0.45)),
								y: (GameModel.SQUARE_SIZE * (y + 0.45))
							};
							pt.x += parentRect.left;
							pt.y += parentRect.top;
							s.point = svgPoint(board.svg, pt);
						}
						board.pieces.forEach(p => {
							p.isOnBoard() && p.placeOn(p.occupying);
						});
					}

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

