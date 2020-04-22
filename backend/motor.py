"""
The chess motor reads Polyglot (.bin) files,
and uses Stockfish to analyze legal moves' scores.
"""
from typing import List

import chess
import chess.engine
import chess.polyglot
import chess.svg
from chess import Board

from backend.database import db
engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')

b: Board = Board()
cursor = db.boards.find_one({'_id': b.fen()})


def board_step(move_uci: str) -> bool:
    """ Updates board and cursor to step by given UCI """
    global b, cursor
    print('Stepping from:')
    print(cursor)
    print(f'Looking for uci {move_uci}')
    for reply in cursor['theory'] + cursor['moves']:
        if reply['uci'] == move_uci:
            cursor = db.boards.find_one({'_id': reply['leads_to']})
            b.push_uci(reply['uci'])
            return True
    return False


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
    m = chess.Move.from_uci(move)
    return m in b.legal_moves


def game_move(move: str, ret_dict) -> None:
    """
    Updates game state with given move.
    Takes UCI string move and return dictionary
    to populate with move-related data
    """
    global b, cursor
    ret_dict['updates'] = list()
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


def suggest_moves(theory=True, other_moves=True) -> List:
    """
    Returns all possible book responses to current position
    Returns list of (UCI, score) tuples
    """
    global b, cursor
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
    global b, cursor
    b.pop()
    cursor = db.boards.find_one({'_id': b.fen()})
