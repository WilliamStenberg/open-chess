import {GameModel, useBoardByUrlService, Board, IMoveResponse, svgPoint} from './BoardService';
import React from 'react';
import { updateSvgArrows } from './BoardSvg'

/**
 * Toolbar to step forward and backward, and switch sides
 */
const StepToolbar: React.FC<{}> = () => {
    const {board, setBoard, doFetch, executeFetchUpdates} = useBoardByUrlService();
    const stepBack = () => {
        doFetch('back', {}, (resp: IMoveResponse) => {
            if (board.backStack.length) {
                setBoard(((b: Board) => {
                    let latest = b.backStack[b.backStack.length - 1];
                    executeFetchUpdates(b, latest.revert);
                    b.backStack.pop();
                    b.forwardStack.push(latest);
                    let previous = b.backStack[b.backStack.length - 1];
                    if (previous && previous.suggestions) {
                        updateSvgArrows(b, previous.suggestions);
                    } else {
                        updateSvgArrows(b, []);
                    }
                    return b;
                })(board));

            } else {
                console.log('backStack is empty');
            }
        }, () => {
            // This fail means no backing possible
            console.log('Could not back');
        });
    };

    const stepForward = () => {
        if (board.forwardStack.length) {
            let next = board.forwardStack[board.forwardStack.length - 1];
            next && doFetch('move', {move: next.move}, (resp: IMoveResponse) => {
                setBoard(((b: Board) => {
                    executeFetchUpdates(b, resp.updates);
                    b.forwardStack.pop();
                    b.backStack.push(resp);
                    updateSvgArrows(b, resp.suggestions);
                    return b;
                })(board));

            }, () => {
                // This fail means no backing possible
                console.log('Could not forward');
            });
        } else {
            console.log('Empty forward stack');
        }
    };

    const flipBoard = () => {
        const elemToElemTuple = (e: Element): [Element, number, number] => {
            let x: number = 0;
            let y: number = 0;
            let xstring = e.getAttribute('x');
            if (xstring && parseInt(xstring)) {
                x = parseInt(xstring);
            }
            let ystring = e.getAttribute('y');
            if (ystring && parseInt(ystring)) {
                y = parseInt(ystring);
            }
            return [e, x, y];
        }

        const flipTextMarks = (b: Board) => {
            if (b.svg) {
                let allMarks = Array.from(b.svg.childNodes.entries())
                    .map(pair => pair[1] as Element)
                    .filter(e => e.nodeName === 'text')
                    .map(e => elemToElemTuple(e));

                let [leftX, orderX] = allMarks[0][1] < allMarks[14][1] ? [allMarks[0][1], true] : [allMarks[14][1], false];
                let nextX = allMarks[2][1] < allMarks[12][1] ? allMarks[2][1] : allMarks[12][1];
                let strideX = nextX - leftX;
                for (let i = 0; i < 16; i += 2) {
                    let newXString = (leftX + ((orderX) ? strideX * (7-(i/2)) : strideX * i/2)).toString();
                    allMarks[i][0].setAttribute('x', newXString);
                    allMarks[i+1][0].setAttribute('x', newXString);
                }
                let [topY, orderY] = allMarks[31][2] > allMarks[16][2] ? [allMarks[31][2], true] : [allMarks[16][2], false];
                let nextY = allMarks[29][2] > allMarks[18][2] ? allMarks[29][2] : allMarks[18][2];
                let strideY = topY - nextY;
                for (let i = 0; i < 16; i += 2) {
                    let newYString = (topY - ((orderY) ? strideY * (i/2) : strideY * (7-i/2))).toString();
                    allMarks[16+i][0].setAttribute('y', newYString);
                    allMarks[17+i][0].setAttribute('y', newYString);
                }
            }
        }

        const flipSquares = (b: Board) => {
            let a8 = b.squares.find(s => s.squareName() === 'a8');
            let parentRect = (a8 && a8.domPiece.parentElement) ? a8.domPiece.parentElement.getBoundingClientRect() : null;
            if (parentRect && b.svg) {
                for (let s of b.squares) {
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
                    s.point = svgPoint(b.svg, pt);
                }
            } else {
                console.error('Could not establish board SVG DOM object');
            }
        }
        setBoard(((b: Board) => {
            GameModel.IS_WHITE = ! GameModel.IS_WHITE;
            flipTextMarks(b);
            flipSquares(b);

            if (b.backStack.length) {
                updateSvgArrows(b, b.backStack[b.backStack.length - 1].suggestions);
            } else {
                updateSvgArrows(b, []);
            }
            return b;
        })(board));
    }

    return (
        <div>
            <button id='backButton' onClick={stepBack}>Back</button>
            <button id='flipButton' onClick={flipBoard}>Flip</button>

            <button id='forwardButton' onClick={stepForward}>Forward</button>
        </div>
    );
};

export default StepToolbar;
