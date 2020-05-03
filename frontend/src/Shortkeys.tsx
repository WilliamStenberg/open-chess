//https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
const keyMap = {
    BACK: 'ArrowLeft',
    FORWARD: 'ArrowRight',
    FLIP: 'f',
    EXPLORE: 'e',
    PRACTISE: 'p',
    UNLINK: ['Delete', 'Backspace', 'u'],
    ARROWS: 'a',
    REJECT: 'r',
    SWAP: 's',
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
    UNLINK: (_?: KeyboardEvent) => {
        let btn = document.getElementById('unlinkButton');
        btn && btn.click();
    },
    ARROWS: (_?: KeyboardEvent) => {
        let btn = document.getElementById('arrowsButton');
        btn && btn.click();
    },
    REJECT: (_?: KeyboardEvent) => {
        let btn = document.getElementById('rejectButton');
        btn && btn.click();
    },
    SWAP: (_?: KeyboardEvent) => {
        let btn = document.getElementById('swapButton');
        btn && btn.click();
    },
};

export {keyMap, keyHandlers};
