import {Board, Suggestion} from './BoardService';
import {colors} from './Settings';
import {GameModel} from './Models';
import {CoordPair} from './BoardSvg';

/**
 * Decide color by name and hex from suggestion arrow properties
 */
const decideArrowColor = (score: number, label: string): [string, string] => {
    if (label.toLowerCase().includes('theory'))
        return ['blue', colors['blue']]; // Always blue for theory
    if (score === undefined || score === null)
        return ['white', colors['white']];
    if (score < -100)
        return ['red', colors['red']]; // Blunder = red
    if (score < -30)
        return ['lightred', colors['lightred']]; // Lightly red for a mistake
    if (score < 0)
        return ['orange', colors['orange']]; // Orange for inaccuracy
    if (score < 30)
        return ['grey', colors['grey']]; // Grey/meh
    if (score < 100)
        return ['lightgreen', colors['lightgreen']]; // Light green for a good move
    return ['green', colors['green']]; // Nice bright green for really good moves
}

/**
 * Clears all arrows on board and feeds fetched suggested move list
 * to constructArrow.
 */
const updateSvgArrows = (board: Board, suggestions: Suggestion[]) => {
    if (board.svg) {
        let toBeRemoved: Node[] = [];
        // Select first piece, to insert before it
        let firstPiece = ((svg) => {
            let found = null;
            for (let [, tag] of svg.childNodes.entries()) {
                if (!found && tag.nodeName === 'use') {
                    found = tag;
                } else if (tag.nodeName === 'g' && (tag as Element).hasAttribute('opacity')) {
                    // Remove 'g' elements containing arrows
                    toBeRemoved = toBeRemoved.concat(tag);
                }
            }
            return found;
        })(board.svg);

        toBeRemoved.forEach(item => board.svg && board.svg.removeChild(item));
        suggestions.forEach((item: Suggestion) => {
            let start = item.move.slice(0, 2), end = item.move.slice(2, 4);
            let from_square = board.squares.find(p => p.squareName() === start);
            let to_square = board.squares.find(p => p.squareName() === end);
            if (from_square && to_square) {
                let arrowForm = constructArrow([from_square.getPosition(), to_square.getPosition()],
                    item.score, item.label, item.move);
                board.svg && board.svg.insertBefore(arrowForm, firstPiece);
            }
        });
    } else {
        console.error('update arrows when no svg?')
    }
};

/**
 * From a given coordinate pair (parsed from a move),
 * create an SVG object for an arrow.
 * Adds mouse hover listeners and a click action for focusing.
 */
const constructArrow: (cp: CoordPair, score: number, label: string, move: string) => SVGGElement = (coordPair, score, label, move) => {
    let doc: SVGLineElement = document.createElementNS("http://www.w3.org/2000/svg",
        "line");
    // Adjusting positions for center-square coordinates
    let x1 = coordPair[0].x + GameModel.SVG_SIZE / 2;
    let x2 = coordPair[1].x + GameModel.SVG_SIZE / 2;
    let y1 = coordPair[0].y + GameModel.SVG_SIZE / 2;
    let y2 = coordPair[1].y + GameModel.SVG_SIZE / 2;

    doc.setAttribute("x1", "" + x1);
    doc.setAttribute("y1", "" + y1);
    doc.setAttribute("x2", "" + x2);
    doc.setAttribute("y2", "" + y2);

    let [arrowName, arrowColor] = decideArrowColor(score, label);
    let opacity = 0.8;

    doc.setAttribute("stroke", arrowColor);
    doc.setAttribute("stroke-width", "7");
    doc.setAttribute("marker-end", "url(#arrowhead"+arrowName+")");
    doc.setAttribute("opacity", "" + opacity);
    doc.addEventListener("mouseenter", () => {
        doc.setAttribute('opacity', "" + Math.min(opacity + 0.2, 1));
        if (! doc.childNodes.length) {
            let title: SVGElement = document.createElementNS("http://www.w3.org/2000/svg", 'title');
            let txt = document.createTextNode(""+score);
            title.appendChild(txt);
            doc.appendChild(title);
        }
    }, false);
    doc.addEventListener("mouseleave", () => {
        doc.setAttribute('opacity', "" + opacity);
        if (doc.childNodes.length) {
            doc.removeChild(doc.childNodes[0]);
        }
    }, false);

    doc.addEventListener("click", () => {
        let btn = document.getElementById('suggestionList'+move);
        btn && btn.click();
    });

    // Wrapping in a g tag for opacity to take effect on the line marker (arrow head)
    let g: SVGGElement = document.createElementNS("http://www.w3.org/2000/svg",
        'g');
    g.setAttribute('opacity', "" + opacity);
    g.appendChild(doc);
    return g;
};

/**
 * Create the arrow SVG elements with basic properties,
 * add them to SVG namespaces, one for each color
 */
const initialiseSvgArrows: () => SVGElement[] = () => {
    let seq: SVGElement[] = [];
    for (let name in colors) {
        let color: string = colors[name];
        let arrowForm = document.createElementNS('http://www.w3.org/2000/svg',
            'marker');
        arrowForm.setAttribute('id', 'arrowhead'+name);
        arrowForm.setAttribute('markerWidth', '3');
        arrowForm.setAttribute('markerHeight', '4');
        arrowForm.setAttribute('refX', '1.5');
        arrowForm.setAttribute('refY', '2');
        arrowForm.setAttribute('orient', 'auto');
        arrowForm.setAttribute('fill', color);

        let poly = document.createElementNS('http://www.w3.org/2000/svg',
            'polygon');
        poly.setAttribute('points', '0 0, 3 2, 0 4');
        arrowForm.appendChild(poly);
        seq = seq.concat(arrowForm);
    }
    return seq;
}

export {updateSvgArrows, initialiseSvgArrows};
