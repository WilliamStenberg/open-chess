import React from 'react'
import './App.css';
import 'rbx/index.css'
import Login from './Login'
import BoardViewer from './BoardSvg'
import {getCookie} from './Cookies'
import {GlobalHotKeys} from 'react-hotkeys'
import {keyMap, keyHandlers} from './Shortkeys'

const MainView: React.FC<{}> = () => {
    // Unused, the idea is to render more than the BoardViewer and use the game object
    return (
        <div>
            {((getCookie('key')) ? <BoardViewer/> : <Login/>)}

        </div>

    )
};

class App extends React.Component {

    render() {
        return (
            <div className="App">
            <GlobalHotKeys keyMap={keyMap} handlers={keyHandlers}/>

                <header className="App-header">
                    <p>
                        Welcome
                    </p>
                </header>
                <MainView/>
            </div>
        );
    }
}

export default App;
