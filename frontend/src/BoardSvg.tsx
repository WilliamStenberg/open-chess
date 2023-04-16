import {GameMode, StringDict, useBoardByUrlService, Board, IMoveResponse} from './BoardService';
import {GameModel, Square, Piece, TPoint} from './Models';
import {updateSvgArrows, initialiseSvgArrows} from './Arrows';
import React from 'react';

export type CoordPair = [TPoint, TPoint];

interface SvgBoardProps {
    svgobj: Element | null;
}

export function svgPoint(element: SVGSVGElement, pt: TPoint): TPoint {
	if (element) {
		let step = element.createSVGPoint();
		step.x = pt.x;
		step.y = pt.y;
		let matrix = element.getScreenCTM();
		if (matrix) {
			let transformed = step.matrixTransform(matrix.inverse());
			return {x: transformed.x, y: transformed.y};
		}
	}
	throw new Error('Bad point transform');
}

/**
 * The view of the chess board, containing SvgBoard for rendering SVG board,
 * mouse dragging functions, and loading a new setup onto the board through loadBoard.
 */
const BoardViewer: React.FC<{}> = () => {
    const {service, board, setBoard, doFetch, executeFetchUpdates} = useBoardByUrlService();

    const onPieceMouseDown: { (pc: Piece, evt: Event): void } = (pc, _) => {
        GameModel.drag = {piece: pc, start: pc.occupying};
    };

    /**
     * SVG transformations when dragging a piece on the board
     */
    const onBoardMouseMove = (evt: Event) => {
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
            if (! GameModel.IS_WHITE) {
                rank = 7 - rank;
                file = 7 - file;
            }

            let square = 'abcdefgh'.charAt(file) + '87654321'.charAt(rank);
            let move: string = drag.start.squareName() + square;
            GameModel.drag = null;
            let endpoint = board.gameMode + '/move';
            doFetch(endpoint, {move: move}, (resp: IMoveResponse) => {
                setBoard(((b: Board)=> {
                    if (! resp.success) {
                        if (drag)
                          drag.piece.placeOn(drag.start);
                        let lastPly = b.backStack[b.backStack.length - 1];
                        updateSvgArrows(b, lastPly.suggestions);
                    } else {
                        resp.moves.forEach(move => {
                            b.backStack.push(move);
                            executeFetchUpdates(b, move.updates);
                        });
                        b.forwardStack = [];

                        let lastPly = b.backStack[b.backStack.length - 1];
                        updateSvgArrows(b, board.gameMode === GameMode.Explore ? lastPly.suggestions : []);
                    }
                    return b;
                })(board));
            }, () => {
                // This fail means server error, or 'illegal move'
                if (drag) {
                    // Move rejected! Resetting piece
                    drag.piece.placeOn(drag.start);
                }
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
        doFetch('svg', {'is_white': GameModel.IS_WHITE}, (resp: StringDict) => {
            if ('svg' in resp) {
                const doc = new DOMParser().parseFromString(resp['svg'], 'application/xml');
                const givenSvg = doc.documentElement as HTMLElement;
                const head: SVGSVGElement = givenSvg.cloneNode() as SVGSVGElement;
                let tags: NodeList = givenSvg.childNodes;
                let squares: Square[] = [];
                let pieces: Piece[] = [];
                let defs: HTMLElement = givenSvg;
                let others: HTMLElement[] = [];
                Piece.onMouseDown = onPieceMouseDown;
                Piece.onMouseMove = onBoardMouseMove;
                Piece.onMouseUp = onBoardMouseUp;
                Square.onMouseMove = onBoardMouseMove;
                tags.forEach((value: Node, key, parent) => {
                    let elem = value as HTMLElement;
                    if (value.nodeName === 'rect') {
                        let squareName = elem.classList[elem.classList.length - 1];
                        if (squareName) {
                            let square = new Square(elem, squareName);
                            squares = squares.concat(square);
                        }

                    } else if (value.nodeName === 'use') {
                        let n = pieces.length;
                        let square = (n >= 16) ? (
                            // black piece/pawn
                            squares[32  + n]
                        ) : (
                            // white piece
                            squares[n]
                        )
                        let pc = new Piece(value as HTMLElement, square);
                        pieces = pieces.concat(pc);
                    } else if (value.nodeName === 'defs') {
                        defs = elem;
                    } else {
                        others = others.concat(elem);
                    }
                });

                // Adding arrow support
                if (defs && defs.firstChild) {
                    // Inserts the arrow form into <defs> tag
                    initialiseSvgArrows().forEach(arr => {
                        defs.appendChild(arr);
                    });
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
                setBoard(((board: Board)  => {
                    board.svg = newSvg;
                    board.pieces = pieces;
                    board.squares = squares;
                    return board;
                })(board));
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
                            let x, y;
                            if (GameModel.IS_WHITE) {
                                x = 'abcdefgh'.indexOf(s.square[0]);
                                y =  8 - parseInt(s.square[1], 10);
                            } else {
                                x = 'hgfedcba'.indexOf(s.square[0]);
                                y =  parseInt(s.square[1], 10) - 1;
                            }
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

    return (<div>
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
        </div>);
};

export default BoardViewer;
