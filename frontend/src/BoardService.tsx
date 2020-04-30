import {useGlobal} from 'reactn';
import {useState} from 'react';
import {url} from './Settings';
import {Square, Piece} from './Models';

export enum GameMode {
    Explore = "explore", Practise = "practise",
}

export type Suggestion = { move: string, san: string, score: number, label: string };

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

export interface Board {
	svg: SVGSVGElement | null;
	pieces: Piece[];
	squares: Square[];
	backStack: RevertibleMove[];
	forwardStack: RevertibleMove[];
    graveyard: Piece[];
    gameMode: GameMode;
    focusedSuggestionUci: string;
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
                let square = board.squares.find(p => p.square === end);

                if (piece && square) {
                    piece.placeOn(square);
                } else {
                    console.error('Could not resurrect piece');
                }
            } else {
                console.error('Graveyard empty!');
            }
        } else if (end === '??') {
            let p = board.pieces.find(p => p.isOnBoard() && p.squareName() === start);
            if (p) {
                board.graveyard.push(p);
                p.remove();
            } else {
                console.error('malformed command?', move);
            }
        } else if (start.toLowerCase() === 'qq') { // Copy queen, QQ for white
            let color = start === 'qq' ? 'black' : 'white';
            let p = board.pieces.find(p => p.pieceType === color + '-queen');
            let square = board.squares.find(p => p.square === end);
            if (p && board.svg && square) {
                let newDomQueen = p.domPiece.cloneNode(true); // deep copy
                board.svg.insertBefore(newDomQueen, p.domPiece);
                let newQueen = new Piece(newDomQueen as HTMLElement, square);

                board.pieces = board.pieces.concat(newQueen);
            } else {
                console.error('Could not copy queen!');
            }
        } else if (end === 'xx') { // Destroy a piece, used when backing a queening
            let p = board.pieces.find(p => p.isOnBoard() && p.squareName() === start);
            if (p) {
                p.domPiece.remove();
                let index = board.pieces.indexOf(p, 0);
                board.pieces.splice(index, 1);
            } else {
                console.error('Could not find piece to destroy');
            }
            
        } else { // Moving pieces
            let piece = board.pieces.find(p => p.isOnBoard() && p.squareName() === start);
            let targetSquare = board.squares.find(p => p.squareName() === end);

            piece && targetSquare && piece.placeOn(targetSquare);
        }
    })
};

/**
 * Represents a generic calling to backend and supplies global board state
 */
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
