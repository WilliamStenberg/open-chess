import {GameModel, useBoardByUrlService, Board, IMoveResponse, svgPoint, StringDict, Suggestion} from './BoardService';
import React, {useState, useEffect} from 'react';
import { updateSvgArrows } from './BoardSvg'
import {Input, Button, List, Icon} from 'rbx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrash} from '@fortawesome/free-solid-svg-icons'
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
                console.error('backStack is empty');
            }
        }, () => {
            // This fail means no backing possible
            console.error('Could not back');
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
                console.error('Could not forward');
            });
        } else {
            console.error('Empty forward stack');
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

    const promptAnalysis = () => {
        doFetch('analyse', {}, (resp: IMoveResponse) => {
            setBoard(((b: Board) => {
                updateSvgArrows(b, resp.suggestions);
                return b;
            })(board));
        }, () => {
            // This fail means no backing possible
            console.error('Could not analyse position');
        });
    }

    return (
        <div>
            <Button id='backButton' onClick={stepBack}>Back</Button>
            <Button id='flipButton' onClick={flipBoard}>Flip</Button>
            <Button id='promptAnalysisButton' onClick={promptAnalysis}>Analyse</Button>
            <Button id='forwardButton' onClick={stepForward}>Forward</Button>
        </div>
    );
};

const Favorites: React.FC<{}> = () => {
    const [text, setText] = useState<string>('');
    const [faveList, setFaveList] = useState<string[]>([]);
    const {board, setBoard, doFetch, executeFetchUpdates} = useBoardByUrlService();

    const addFavorite = () => {
        doFetch('favorites/add', {name: text}, (resp: StringDict) => {
            setFaveList(fl => fl.concat(text));
            setText('');
        }, (error) => {
            console.error('Could not add favorite');
        });
    };

    const getFavorites = () => {
        doFetch('favorites/list', {}, (resp: StringDict) => {
            setFaveList(resp.favorites);
          });
    }

    const loadFavorite = (favoriteName: string) => {
        doFetch('favorites/load', {name: favoriteName}, (resp: IMoveResponse) => {
            setBoard(((b: Board) => {
                resp.revert = resp.revert.reverse();
                while (b.backStack.length) {
                    let latest = b.backStack[b.backStack.length - 1];
                    executeFetchUpdates(b, latest.revert);
                    b.backStack.pop();
                }
                b.backStack = [resp];
                executeFetchUpdates(b, resp.updates);
                b.forwardStack = [];
                updateSvgArrows(b, resp.suggestions);
                return b;
            })(board));
        }, (error) => {
            console.error(error);
        });
    }

    const removeFavorite = (favoriteName: string) => {
        doFetch('favorites/remove', {name: favoriteName}, (resp: IMoveResponse) => {
            setFaveList(fl => {
                const index = fl.indexOf(favoriteName, 0);
                if (index > -1) {
                    fl.splice(index, 1);
                }
                return fl;
            });
        }, (error) => {
            console.error(error);
        });
    }

    useEffect(getFavorites, []); // Run only on component load

    return (
        <div>
            <List className='favorites'>
                {faveList.map((f, i) => {
                    return (
                        <List.Item className='favorite' key={i} onClick={() => loadFavorite(f)}>

                        {f}
                        <Icon color='danger' key='danger' size='small'
                        onClick={(e: MouseEvent) => {e.stopPropagation(); removeFavorite(f); }} >
                            <FontAwesomeIcon icon={faTrash} size='xs' />

                        </Icon>
                    </List.Item>)
                })}
            </List>
            <Input type="text" placeholder="Add position name" value={text} className='favorite-bar'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value)} />
        <Button className='favorite-add-btn' onClick={addFavorite}>Add</Button>
    </div>
    );
};

export {StepToolbar, Favorites};
