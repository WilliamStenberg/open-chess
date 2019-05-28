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

b: Board = Board()

reader = chess.polyglot.open_reader('Titans.bin')
engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')


def get_empty_board() -> chess.Board:
    """ Return a starting SVG board """
    global b
    b = chess.Board()
    return chess.svg.board(board=b)


def is_valid_move(move: str) -> bool:
    """ Tests move string for legality in game or as special-command """
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
    global b
    ret_dict['updates'] = list()
    # TODO extend from legal move to "good move" by Polyglot or Stockfish
    board_move = chess.Move.from_uci(move)

    if b.is_en_passant(board_move):
        pawn_square = move[2] + str(int(move[3]) + (-1 if b.turn else 1))
        print(f'En passant, removing from: {pawn_square}')
        ret_dict['updates'].append(pawn_square + '??')  # Signal this is a removal
    elif b.is_kingside_castling(board_move):
        ret_dict['updates'].append('h1f1' if b.turn else 'h8f8')
    elif b.is_queenside_castling(board_move):
        ret_dict['updates'].append('h1f1' if b.turn else 'h8f8')
    else:
        remove = board_move.from_square in b.attackers(chess.WHITE if b.turn else chess.BLACK, board_move.to_square)
        if remove:
            print('This is a capture')
            ret_dict['updates'].append(move[2:] + '??')
    b.push(board_move)  # type: chess.Board


def suggest_moves() -> List:
    """
    Returns all possible book responses to current position
    :return: List of move UCI strings
    """
    global b, reader
    games = list(reader.find_all(b))
    print('Book moves: ')
    suggested_moves = list()
    sum_weights = sum([ent.weight for ent in games])
    for entry in games:
        move = entry.move()
        # TODO classify suggestions depending on whether the move is known/bad/favorite
        print('{}: learn={}, weight={}'.format(move.uci(), entry.learn, entry.weight))

        popularity = entry.weight / sum_weights
        label = 'good' if popularity > 0.3 else 'bad'

        suggested_moves.append({'move': move.uci(), 'opacity': popularity, 'label': label})
    return suggested_moves
