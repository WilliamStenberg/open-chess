import {useGlobal} from 'reactn';
import {useState} from 'react';
import {url} from './Settings';

export enum GameMode {
    Explore = "explore", Practise="practise",
}

export interface Drag {
	piece: Piece;
	start: Square;

}

/**
 * Transform point - pixel values in DOM terms
 */
export interface TPoint {
	x: number,
	y: number;
}

export class TPoint {
	toString() {
		return "" + this.x + ',' + this.y
	}
}

export type Suggestion = { move: string, score: number, label: string };

export type RevertibleMove = {
    move: string, updates: string[],
    revert: string[], suggestions: Suggestion[]
};

export type StepBackResponse = {success: boolean; suggestions: Suggestion[]};
export type AnalysisResponse = StepBackResponse;

/**
 * The response from the server when passing a move
 */
export interface IMoveResponse {
    success: boolean;
    moves: RevertibleMove[];
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

export abstract class GameModel {
	public static drag: Drag | null = null;
	public static SQUARE_SIZE = 0;
	public static SVG_SIZE = 0;
	public static SVG_OFFSET = 0;
    public static IS_WHITE = true;
	domPiece: HTMLElement;
	square: string;
	color?: boolean;
	point: TPoint;

	protected constructor(domPiece: HTMLElement, squareName: string) {
		this.domPiece = domPiece;
		this.square = squareName;
		this.point = {x: 0, y: 0};

	}

	public abstract registerMouseHandlers(mouseDown?: (pc: Piece, evt: Event) => void,
	                                      mouseUp?: (pc: Square, evt: Event) => void,
	                                      mouseMove?: (pc: Square, evt: Event) => void): void;

	public squareName(): string {
		return this.square;
	}

	public static transform(point: TPoint): string {
		return 'translate(' + point.x + ', ' + point.y + ')';
	}

	public abstract getPosition(): TPoint;
}

export class Square extends GameModel {
	constructor(domPiece: HTMLElement, square: string) {
		super(domPiece, square);
	}

	registerMouseHandlers(mouseDown: (pc: Piece, evt: Event) => void,
	                      mouseUp?: (pc: Square, evt: Event) => void,
	                      mouseMove?: (pc: Square, evt: Event) => void): void {
		if (mouseUp) {
			this.domPiece.onmouseup = (evt: Event) => {
				mouseUp(this, evt)
			};
		}
		if (mouseMove) {
			this.domPiece.onmousemove = (evt: Event) => {
				mouseMove(this, evt)
			};
		}
	}

	public getPosition(): TPoint {
		return this.point;
	}

}

export class Piece extends GameModel {
	private pieceType: string;
	onBoard: boolean = true;
	occupying: Square;

	constructor(domPiece: HTMLElement, type: string, square: Square) {
		super(domPiece, square.squareName());
		this.pieceType = type;
		this.occupying = square;
	}

	isOnBoard(): boolean {
		return this.onBoard;
	}

	public registerMouseHandlers(mouseDown?: (pc: Piece, evt: Event) => void,
	                             mouseUp?: (pc: Square, evt: Event) => void,
	                             mouseMove?: (pc: Square, evt: Event) => void): void {
		if (mouseDown) {
			this.domPiece.onmousedown = (evt: Event) => {
				mouseDown(this, evt)
			};
		}

		if (mouseMove) {
			this.domPiece.onmousemove = (evt: Event) => {
				mouseMove(this, evt)
			};
		}

		if (mouseUp) {
			this.domPiece.onmouseup = (evt: Event) => {
				mouseUp(this, evt)
			};
		}
	}

	public moveTo(newPosition: TPoint) {
		this.domPiece.setAttribute('transform',
			Piece.transform(newPosition));
		this.point = newPosition;
	}

	public move(delta: TPoint) {
		let point = this.getPosition();
		point = {x: point.x + delta.x, y: point.y + delta.y};
		this.moveTo(point);
	}

	public placeOn(square: Square) {
		this.domPiece.setAttribute('display', 'default');
		let pt = square.getPosition();
		this.moveTo(pt);

		this.occupying = square;
		this.square = square.squareName();
		this.onBoard = true;
	}

	public remove() {
		this.domPiece.setAttribute('display', 'none');
		this.domPiece.setAttribute('transform', 'translate(0, 0)');
		this.onBoard = false;

	}

	public getPosition(): TPoint {
		let transStr = this.domPiece.getAttribute('transform');
		if (transStr) {
			const csv = transStr.split('translate(')[1].split(')')[0];
			if (csv && csv.split(',').length === 2) {
				let [x, y] = csv.split(',');
				return {x: parseInt(x, 10), y: parseInt(y, 10)};
			}
		}
		return {x: 0, y: 0};
	}
}


export interface Board {
	svg: SVGSVGElement | null;
	svgPoint: any;
	pieces: Piece[];
	squares: Square[];
	backStack: RevertibleMove[];
	forwardStack: RevertibleMove[];
    graveyard: Piece[];
    gameMode: GameMode;
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


const executeFetchUpdates = (board: Board, commands: string[]) => {
    // TODO: Could be optimized by a single loop over board pieces?
    commands.forEach((move) => {
        let start = move.slice(0, 2), end = move.slice(2, 4);
        if (start === '??') {
            // Fetch the object from the remove queue
            if (board.graveyard.length) {
                let piece = board.graveyard.pop();
                let square = board.squares.find((p: Piece) => p.square === end);

                if (piece && square) {
                    piece.placeOn(square);
                } else {
                    console.error('Could not resurrect piece');
                }
            } else {
                console.error('Graveyard empty!');
            }
        } else if (end === '??') {
            let p = board.pieces.find((p: Piece) => p.isOnBoard() && p.squareName() === start);
            if (p) {
                board.graveyard.push(p);
                p.remove();
            } else {
                console.error('malformed command?', move);
            }
        } else { // Moving pieces
            let piece = board.pieces.find((p: Piece) => p.isOnBoard() && p.squareName() === start);
            let targetSquare = board.squares.find((p: Piece) => p.squareName() === end);

            piece && targetSquare && piece.placeOn(targetSquare);
        }
    })
};



/**
 * Represents the calling to backend
 * */
const useBoardByUrlService = () => {
    // Result here refers to a board fetch request
    const [service, setService] = useState<Service<string>>({status: 'init'});



    /**
     * Helper function to perform a fetch call to backend with given dictionary.
     * Must supply endpoint, request dict and resolve function,
     * reject function is optional but will always setService to error.
     */
    const doFetch = (endpoint: string, requestDict: { [key: string]: any },
        resolve: (response: StringDict) => void,
        reject?: (response: StringDict) => void) => {
            let spinner = document.createElement('DIV');
            spinner.classList.add('loading-spinner');
            spinner.id = 'loadingSpinner';
            document.body.appendChild(spinner);
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
                    if ('err' in response) {
                        console.error(response['err'])
                        reject_func(response);
                    } else {
                        resolve(response);
                        setService({status: 'loaded', payload: response})
                    }
                    let spinner = document.getElementById('loadingSpinner');
                    spinner && spinner.remove();
                })
                .catch(error => {
                    setService({status: 'error', error});
                    console.error('Fetch error on ' + endpoint + ', us sending:');
                    console.log(requestDict);
                    console.log(error);
                    reject_func(error);
                    let spinner = document.getElementById('loadingSpinner');
                    spinner && spinner.remove();
                })

        };

    const [board, setBoard] = useGlobal('board');

    return {service, board, setBoard, doFetch, executeFetchUpdates};
};

export {useBoardByUrlService};




