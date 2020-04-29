import {GameModel, GameMode, useBoardByUrlService, Board, IMoveResponse, svgPoint, StringDict, StepBackResponse, AnalysisResponse, Suggestion} from './BoardService';
import React, {useState, useEffect} from 'react';
import { updateSvgArrows } from './BoardSvg'
import {Input, Button, List, Icon, Divider} from 'rbx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {faTrash, faCheckCircle, faAngleDown, faAngleUp} from '@fortawesome/free-solid-svg-icons'
/**
 * Toolbar to step forward and backward, and switch sides
 */
const StepToolbar: React.FC<{}> = () => {
    const {board, setBoard, doFetch, executeFetchUpdates} = useBoardByUrlService();
    const stepBack = () => {
        if (board.backStack.length) {
            let plies = board.gameMode === GameMode.Explore ? 1 : 2;
            doFetch('back', {plies: plies}, (resp: StepBackResponse) => {
                setBoard(((b: Board) => {
                    let latest;
                    for (let i = 0; i < plies; ++i) {
                        latest = b.backStack[b.backStack.length - 1];
                        executeFetchUpdates(b, latest.revert);
                        b.backStack.pop();
                        b.forwardStack.push(latest);
                    }
                    if (b.backStack.length) {
                        b.backStack[b.backStack.length - 1].suggestions = resp.suggestions;
                    }
                    if (board.gameMode === GameMode.Explore) {
                        updateSvgArrows(b, resp.suggestions);
                    } else {
                        updateSvgArrows(b, []);
                    }
                    return b;
                })(board));


            }, (error) => {
                // This fail means no backing possible
                console.error('Could not back:', error);
            });
        } else {
            console.error('backStack is empty');
        }
    };

    const stepForward = () => {
        if (board.forwardStack.length) {
            let forwardMoves = [board.forwardStack[board.forwardStack.length - 1]];
            if (board.gameMode === GameMode.Practise && board.forwardStack.length >= 2) {
                forwardMoves = forwardMoves.concat(
                    board.forwardStack[board.forwardStack.length - 2]);
            }
            let forwardMoveUcis = forwardMoves.map(fm => fm.move);

            doFetch('forward', {moves: forwardMoveUcis}, (resp: IMoveResponse) => {
                setBoard(((b: Board) => {
                    resp.moves.forEach(revMove => {
                        executeFetchUpdates(b, revMove.updates);
                        b.forwardStack.pop();
                        b.backStack.push(revMove);
                    });
                    if (b.gameMode === GameMode.Explore) {
                        updateSvgArrows(b, resp.moves[resp.moves.length - 1].suggestions);
                    } else {
                        updateSvgArrows(b, []);
                    }
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
        doFetch('analyse', {}, (resp: AnalysisResponse) => {
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
                while (b.backStack.length) {
                    let latest = b.backStack[b.backStack.length - 1];
                    executeFetchUpdates(b, latest.revert);
                    b.backStack.pop();
                }
                resp.moves.forEach(m => {
                    b.backStack = b.backStack.concat(m);
                    executeFetchUpdates(b, m.updates);
                });
                b.forwardStack = [];
                let lastPly = b.backStack[b.backStack.length - 1];
                if (lastPly) {
                    updateSvgArrows(b, lastPly.suggestions);
                } else {
                    updateSvgArrows(b, []);
                }
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
            <Button className='favorite-add-btn' onClick={addFavorite}>
                <Icon color='primary'><FontAwesomeIcon icon={faCheckCircle}/></Icon>
            </Button>
    </div>
    );
};

const ModeSelector: React.FC<{}> = () => {
    const {board, setBoard} = useBoardByUrlService();
    const setExploreMode = () => {
        setBoard(((b: Board) => {
            b.gameMode = GameMode.Explore;
            if (b.backStack.length) {
                let previous = b.backStack[b.backStack.length - 1];
                if (previous && previous.suggestions) {
                    updateSvgArrows(b, previous.suggestions);
                }
            }
            return b;
        })(board));
    };
    const setPractiseMode = () => {
        setBoard(((b: Board) => {
            b.gameMode = GameMode.Practise;
            updateSvgArrows(b, []);
            return b;
        })(board));
    };
    useEffect(setExploreMode, []);
    return (
        <List>
            <List.Item id='exploreItem' onClick={setExploreMode}
            active={board.gameMode === GameMode.Explore}>Explore</List.Item>
            <List.Item id='practiseItem'onClick={setPractiseMode}
            active={board.gameMode === GameMode.Practise}>Practise</List.Item>

        </List>
    );
}

const SuggestionTools: React.FC<{}> = () => {
    const {board, setBoard, doFetch} = useBoardByUrlService();
    const [show, setShow] = useState<boolean>(false);
    const [focused, setFocused] = useState<Suggestion | null>(null);
    let suggestions: Suggestion[];
    if (board.backStack.length) {
        suggestions = board.backStack[board.backStack.length - 1].suggestions;
        if (suggestions && focused) {
            let found = suggestions.find(s => s === focused);
            if (! found) {
                setFocused(null);
            }
        }
    }

    const SuggestionList: React.FC<{}> = () => {
        return (
            <div>
                <Button className='suggestion-button' onClick={() => setShow(t => ! t)}>
                    <span>Arrows</span>
                    <Icon size="small">
                        <FontAwesomeIcon icon={show ? faAngleUp : faAngleDown} />
                    </Icon>
                </Button>
                <List className={'suggestion-list'+(show ? '' : '-hidden')}>{suggestions && suggestions.map(s =>
                    <List.Item key={s.move} className='suggestion-list-item' id={'suggestionList'+s.move} onClick={() => {setShow(t => ! t); setFocused(s)}}>
                        {s.san}
                        </List.Item>)}
                    </List>
                    </div>);
    };


    const SuggestionMenu: React.FC<{}> = () => {
        const unlinkFocusedSuggestion = () => {
            focused && doFetch('unlink', {move: focused.move}, (resp: AnalysisResponse) => {
                setBoard(((b: Board) => {
                    updateSvgArrows(b, resp.suggestions);
                    setFocused(null);
                    return b;
                })(board));
            }, (error) => {
                console.error('Bad unlink:', error);
            });
        };
        return (focused ? (<div>
            <Divider>Suggestion arrow</Divider>
            <h3>{focused.san}</h3>
            <Button className='suggestion-menu-button' id='unlinkButton' onClick={unlinkFocusedSuggestion}>
            <Icon color='danger' key='danger' size='small'>
                <FontAwesomeIcon icon={faTrash} size='xs' />
            </Icon>
            <span className='button-spacer'></span>Unlink
        </Button>
        </div>) : (<div></div>));
    };


    return (<div>
        <SuggestionList/>
        {focused && (<SuggestionMenu/>)}

        </div>);
};

export {StepToolbar, Favorites, ModeSelector, SuggestionTools};
