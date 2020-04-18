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
import pymongo

engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')
db = pymongo.MongoClient().chessdb

b: Board = Board()
cursor = db.moves.find_one({'fen': b.fen()})

def cursor_step(move_uci: str) -> bool:
    global cursor
    print('Stepping from:')
    print(cursor)
    print(f'Looking for uci {move_uci}')
    for reply_id in cursor['replies']:
        reply = db.moves.find_one({'_id': reply_id})
        if reply['uci'] == move_uci:
            cursor = reply
            return True
    return False

def get_empty_board() -> chess.Board:
    """ Return a starting SVG board """
    global b, cursor
    b = chess.Board()
    cursor = db.moves.find_one({'fen': b.fen()})
    print('Empty board setting')

    return chess.svg.board(board=b)


def is_valid_move(move: str) -> bool:
    """ Tests move uci string for legality in game or as special-command """
    global b
    # TODO handle special requests such as 'pop'
    if len(move) != 4 or '?' in move:
        return False
    m = chess.Move.from_uci(move)
    return m in b.legal_moves


def perform_move(move: str, ret_dict) -> None:
    """
    Tries to perform move on the board, returns True if successful
    :param move: UCI move
    :param ret_dict: The return dictionary to populate with move-related data
    """
    global b, cursor
    ret_dict['updates'] = list()
    ret_dict['revert'] = list()
    # TODO extend from legal move to "good move" by Polyglot or Stockfish
    board_move = chess.Move.from_uci(move)
    start = move[:2]
    end = move[2:]
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
    b.push(board_move)  # type: chess.Board
    cursor_step(board_move.uci())

    


def suggest_moves() -> List:
    """
    Returns all possible book responses to current position
    :return: List of move UCI strings
    """
    global b, cursor
    print('DBmoves: ')
    suggested_moves = list()
    finder = lambda reply_id: db.moves.find_one({'_id': reply_id})
    moves = list(map(finder, cursor['replies']))
    for dbmove in moves:
        suggested_moves.append({'move': dbmove['uci'], 'opacity': 0.6,
                                'label': 'A move'})
    return suggested_moves
