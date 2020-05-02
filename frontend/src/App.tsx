import React from 'react'
import './App.css';
import 'rbx/index.css'
import Login from './Login'
import BoardViewer from './BoardSvg'
import {getCookie} from './Cookies'
import {GlobalHotKeys} from 'react-hotkeys'
import {keyMap, keyHandlers} from './Shortkeys'
import {StepToolbar, Favorites, ModeSelector, SuggestionTools, PractiseTools} from './Toolbars';
import {Column, Box, Divider} from 'rbx';

const MainView: React.FC<{}> = () => {
    // Unused, the idea is to render more than the BoardViewer and use the game object
    return (<div>
        {(!getCookie('key')) ? <Login/> : (
            <Column.Group>
                <Column size='one-fifth'>
                    <ModeSelector/>
                    <Favorites/>
                </Column>
                <Column size='three-fifths'>
                    <BoardViewer/>
                    <StepToolbar/>
                </Column>
                <Column size='one-fifth'>
                    <Box>
                        <Divider className='detail-divider'>Details</Divider>
                        <SuggestionTools/>
                        <PractiseTools/>
                    </Box>
                </Column>

            </Column.Group>
        )}
            </div>);
};

class App extends React.Component {

    render() {
        return (
            <div className="App">
                <GlobalHotKeys keyMap={keyMap} handlers={keyHandlers}/>
                <header className="App-header">
                    <p>Open-Chess</p>
                </header>
                <MainView/>
            </div>
        );
    }
}

export default App;
