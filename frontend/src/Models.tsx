/**
 * Drag object created on mousedown and kept during
 * mouse moving
 */
export type Drag = {
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
		return '' + this.x + ',' + this.y
	}
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
