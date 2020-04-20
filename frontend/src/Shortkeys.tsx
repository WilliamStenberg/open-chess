
const keyMap = {
    BACK: 'ArrowLeft',
    FORWARD: 'ArrowRight'
};

const keyHandlers = {
    BACK: (_?: KeyboardEvent) => {
        console.log('back'); 
        let btn = document.getElementById('backButton');
        btn && btn.click();

    },
    FORWARD: (_?: KeyboardEvent) => {
        let btn = document.getElementById('forwardButton');
        btn && btn.click();
    }
};

export {keyMap, keyHandlers};
