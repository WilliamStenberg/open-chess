import {useBoardByUrlService, Board, IMoveResponse} from './BoardService';
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

    return (
        <div>
            <button id='backButton' onClick={stepBack}>Back</button>

            <button id='forwardButton' onClick={stepForward}>Forward</button>
        </div>
    );
};

export default StepToolbar;
