"""
The chess motor reads Polyglot (.bin) files,
and uses Stockfish to analyze legal moves' scores.
"""
from typing import List, Dict
import random
import chess
import chess.engine
import chess.polyglot
import chess.svg
from chess import Board

from backend.database import db, analyse_position
engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')

b: Board = Board()
cursor = db.boards.find_one({'_id': b.fen()})


def board_step(move_uci: str):
    """ Updates board and cursor to step by given UCI """
    global b, cursor
    print('Stepping from:')
    print(cursor)
    found = False
    for reply in cursor['theory'] + cursor['moves']:
        if reply['uci'] == move_uci:
            old_cursor = cursor.copy()
            cursor = db.boards.find_one({'_id': reply['leads_to']})
            if cursor is None or \
               'score' not in cursor or \
               cursor['score'] is None:
                print('The move is known, but not evaluated')
                analyse_position(old_cursor, b,
                                 [chess.Move.from_uci(move_uci)])
                cursor = db.boards.find_one({'_id': reply['leads_to']})
            b.push_uci(reply['uci'])
            found = True
            break
    if not found:
        print('Want to analyse this new move,', move_uci)
        analyse_position(cursor, b, [chess.Move.from_uci(move_uci)])
        b.push_uci(move_uci)
        cursor = db.boards.find_one({'_id': b.fen()})


def get_empty_board(is_white: bool) -> chess.Board:
    """ Return a starting SVG board """
    global b, cursor
    b = chess.Board()
    cursor = db.boards.find_one({'_id': b.fen()})
    print('Empty board setting')
    return chess.svg.board(board=b, flipped=not is_white)


def is_valid_move(move: str) -> bool:
    """ Tests move uci string for legality in game or as special-command """
    global b
    # TODO handle special requests such as 'pop'
    if len(move) != 4 or '?' in move:
        return False
    try:
        m = chess.Move.from_uci(move)
    except ValueError:
        return False
    return m in b.legal_moves


def is_good_move(move: str) -> bool:
    """
    A move is good if it is theory, or there is no
    available theory and the move is the best of the
    known moves. An unknown move can never be good.
    """
    global cursor
    if cursor['theory']:
        return move in map(lambda m: m['uci'], cursor['theory'])
    if not cursor['moves']:
        trigger_analysis()
    best_other_move = sorted(
        cursor['moves'],
        key=lambda m: m['score_diff'], reverse=True)[0]
    return move == best_other_move['uci']


def game_move(move: str) -> Dict:
    """
    Updates game state with given move.
    Takes UCI string move and return dictionary
    with the revertible move and its suggestions (after the move is made)
    """
    global b, cursor
    move_dict = {'updates': [], 'revert': []}
    board_move = chess.Move.from_uci(move)
    start = move[:2]
    end = move[2:]
    move_dict['move'] = move
    if b.is_en_passant(board_move):
        pawn_square = move[2] + str(int(move[3]) + (-1 if b.turn else 1))
        move_dict['updates'].append(pawn_square + '??')  # Remove
        move_dict['updates'].append(start + end)  # Affirm the requested move
        revert_pair = [end + start, '??' + pawn_square]

        move_dict['revert'] = revert_pair + move_dict['revert']

    elif b.is_kingside_castling(board_move):
        move_dict['updates'].append(start + end)
        move_dict['updates'].append('h1f1' if b.turn else 'h8f8')
        revert_pair = [end + start, 'f1h1' if b.turn else 'f8h8']
        move_dict['revert'] = revert_pair + move_dict['revert']
    elif b.is_queenside_castling(board_move):
        move_dict['updates'].append(start + end)
        move_dict['updates'].append('a1d1' if b.turn else 'a8d8')
        revert_pair = [end + start, 'd1a1' if b.turn else 'd8a8']
        move_dict['revert'] = revert_pair + move_dict['revert']
    else:
        remove = b.piece_at(board_move.to_square)
        if remove:
            move_dict['updates'].append(end + '??')
            move_dict['updates'].append(start + end)
            revert_pair = [end + start, '??' + end]
            move_dict['revert'] = revert_pair + move_dict['revert']
        else:
            # Regular move
            move_dict['updates'].append(start + end)
            move_dict['revert'] = [end + start] + move_dict['revert']
    board_step(board_move.uci())
    move_dict['suggestions'] = [] if b.is_game_over() else suggest_moves()
    return move_dict


def push_practise_move():
    """
    Have the engine push a known move to the currect game,
    used in practise mode.
    Modifies ret_dict, no return.
    """
    # TODO: Add settings (which moves to push) as parameters
    global b, cursor
    if not cursor['theory'] and not cursor['moves']:
        trigger_analysis()

    candidate_ucis = list(map(
        lambda m: m['uci'],
        cursor['theory'] + cursor['moves']))
    return game_move(random.choice(candidate_ucis))


def trigger_analysis():
    """ Trigger a longer analysis """
    global b, cursor
    analyse_position(cursor, b, extended=True)
    cursor = db.boards.find_one({'_id': cursor['_id']})


def suggest_moves(theory=True, other_moves=True) -> List:
    """
    Returns all possible book responses to current position
    Returns list of (UCI, score) tuples
    """
    global b, cursor
    if not cursor['theory'] and not cursor['moves']:
        analyse_position(cursor, b)
        cursor = db.boards.find_one(
            {'_id': cursor['_id']})
    suggested_moves = list()
    if theory:
        for move in cursor['theory']:
            suggested_moves.append({
                'move': move['uci'], 'score': move['score_diff'],
                'label': 'Theory move'})
    if other_moves:
        for move in cursor['moves']:
            suggested_moves.append({
                'move': move['uci'], 'score': move['score_diff'],
                'label': 'Other move'})

    return suggested_moves


def can_step_back(num_plies: int) -> bool:
    """ Return bool on if the board can be popped num_plies times """
    global b
    return len(b.move_stack) >= num_plies


def step_back():
    """ Pops the Board stack and updates cursor """
    global b, cursor
    b.pop()
    cursor = db.boards.find_one({'_id': b.fen()})


def add_position_as_favorite(name: str) -> bool:
    """
    Insert board as favorite if name and FEN does not exist in DB,
    also registers move stack to replicate move-by-move.
    Returns success boolean
    """
    global b
    found = db.favorites.find_one({'name': name})
    if found:
        return None
    found = db.favorites.find_one({'fen': b.fen()})
    if found:
        return None
    favorite_object = {
        'name': name,
        'fen': b.fen(),
        'uci_stack': [m.uci() for m in b.move_stack]
    }
    db.favorites.insert_one(favorite_object)
    return True


def remove_position_as_favorite(name: str) -> bool:
    """ Removes a favorite object by name """

    found = db.favorites.find_one({'name': name})
    if not found:
        return False
    return db.favorites.delete_one({'name': name}).deleted_count > 0


def get_favorite_list() -> List:
    """ Fetch all favorites from DB """
    return list(map(lambda x: x['name'], db.favorites.find({})))


def load_favorite_by_name(name: str, ret_dict: Dict):
    """
    Resets board and steps through a favorite move stack,
    Populates ret_dict. Returns success boolean.
    """
    global b, cursor
    favorite_object = db.favorites.find_one({'name': name})
    if not favorite_object:
        return False
    while b.move_stack:
        b.pop()
    cursor = db.boards.find_one({'_id': b.fen()})
    ret_dict['moves'] = []
    for move_uci in favorite_object['uci_stack']:
        ret_dict['moves'].append(game_move(move_uci))

    print('Loaded', ret_dict)
    return True
