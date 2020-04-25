
const keyMap = {
    BACK: 'ArrowLeft',
    FORWARD: 'ArrowRight',
    FLIP: 'f',
    EXPLORE: 'e',
    PRACTISE: 'p'
};

const keyHandlers = {
    BACK: (_?: KeyboardEvent) => {
        let btn = document.getElementById('backButton');
        btn && btn.click();

    },
    FORWARD: (_?: KeyboardEvent) => {
        let btn = document.getElementById('forwardButton');
        btn && btn.click();
    },
    FLIP: (_?: KeyboardEvent) => {
        let btn = document.getElementById('flipButton');
        btn && btn.click();
    },
    EXPLORE: (_?: KeyboardEvent) => {
        let btn = document.getElementById('exploreItem');
        btn && btn.click();
    },
    PRACTISE: (_?: KeyboardEvent) => {
        let btn = document.getElementById('practiseItem');
        btn && btn.click();
    },




};

export {keyMap, keyHandlers};
