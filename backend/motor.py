"""
The chess motor reads Polyglot (.bin) files,
and uses Stockfish to analyze legal moves' scores.
"""
from typing import List, Dict

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
    print(f'Looking for uci {move_uci}')
    found = False
    for reply in cursor['theory'] + cursor['moves']:
        if reply['uci'] == move_uci:
            old_cursor = cursor.copy()
            cursor = db.boards.find_one({'_id': reply['leads_to']})
            if not cursor['score']:
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


def game_move(move: str, ret_dict) -> None:
    """
    Updates game state with given move.
    Takes UCI string move and return dictionary
    to populate with move-related data
    """
    global b, cursor
    if not 'updates' in ret_dict:
        ret_dict['updates'] = list()
    if not 'revert' in ret_dict:
        ret_dict['revert'] = list()
    # TODO extend from legal move to "good move" by Polyglot or Stockfish
    board_move = chess.Move.from_uci(move)
    start = move[:2]
    end = move[2:]
    ret_dict['move'] = move
    if b.is_en_passant(board_move):
        pawn_square = move[2] + str(int(move[3]) + (-1 if b.turn else 1))
        ret_dict['updates'].append(pawn_square + '??')  # Remove
        ret_dict['updates'].append(start + end)  # Affirm the requested move
        ret_dict['revert'].append(end + start)  # Slide back the pawn
        ret_dict['revert'].append('??' + pawn_square)  # Create

    elif b.is_kingside_castling(board_move):
        ret_dict['updates'].append(start + end)
        ret_dict['updates'].append('h1f1' if b.turn else 'h8f8')
        ret_dict['revert'].append(end + start)  # King go back
        ret_dict['revert'].append('f1h1' if b.turn else 'f8h8')
    elif b.is_queenside_castling(board_move):
        ret_dict['updates'].append(start + end)
        ret_dict['updates'].append('a1d1' if b.turn else 'a8d8')
        ret_dict['revert'].append(end + start)  # King go back
        ret_dict['revert'].append('d1a1' if b.turn else 'd8a8')
    else:
        remove = b.piece_at(board_move.to_square)
        if remove:
            ret_dict['updates'].append(end + '??')
            ret_dict['updates'].append(start + end)
            ret_dict['revert'].append(end + start)
            ret_dict['revert'].append('??' + end)
        else:
            # Regular move
            ret_dict['updates'].append(start + end)
            ret_dict['revert'].append(end + start)
    board_step(board_move.uci())


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


def can_step_back() -> bool:
    """ Return bool on if there is a move in the move_stack """
    global b
    try:
        b.peek()
    except IndexError:
        return False
    return True


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
    return db.favorites.delete_one({'name': name}).deleted_count> 0


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
    ret_dict['updates'] = []
    ret_dict['revert'] = []
    for move_uci in favorite_object['uci_stack']:
        print('abla', move_uci)
        game_move(move_uci, ret_dict)

    print(ret_dict)
    return True
