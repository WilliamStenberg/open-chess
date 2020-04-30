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

	public squareName(): string {
		return this.square;
	}

	public static transform(point: TPoint): string {
		return 'translate(' + point.x + ', ' + point.y + ')';
	}

	public abstract getPosition(): TPoint;
}

export class Square extends GameModel {
    static onMouseMove: (evt: Event) => void = (evt) => {};

	constructor(domPiece: HTMLElement, square: string) {
		super(domPiece, square);
        this.domPiece.onmousemove = Square.onMouseMove;
	}

	public getPosition(): TPoint {
		return this.point;
	}

}

export class Piece extends GameModel {
	pieceType: string;
	onBoard: boolean = true;
    occupying: Square;
    static onMouseDown: (pc: Piece, evt: Event) => void = (pc, evt) => {};
    static onMouseMove: (evt: Event) => void = (evt) => {};
    static onMouseUp: (pc: Piece, evt: Event) => void = (pc, evt) => {};

	constructor(domPiece: HTMLElement, square: Square) {
		super(domPiece, square.squareName());
		this.occupying = square;
        let pieceAttr = domPiece.attributes.getNamedItem('xlink:href');
        // Substring eliminates octothorpe in piece type given by SVG
        this.pieceType = pieceAttr ? pieceAttr.value.substring(1)  : '';
        this.registerMouseHandlers();
	}

	isOnBoard(): boolean {
		return this.onBoard;
	}

    private registerMouseHandlers(): void {
        this.domPiece.onmousedown = (evt: Event) => {
            Piece.onMouseDown(this, evt)
        };

        this.domPiece.onmousemove = Piece.onMouseMove;

        this.domPiece.onmouseup = (evt: Event) => {
            Piece.onMouseUp(this, evt)
        };
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
