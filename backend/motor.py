"""
The chess motor reads Polyglot (.bin) files,
and uses Stockfish to analyze legal moves' scores.
"""
import chess
import chess.polyglot
import chess.engine
import chess.svg
from chess import Board
from typing import List, Dict

b: Board = Board()

reader = chess.polyglot.open_reader('Titans.bin')
engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')


def get_empty_board() -> chess.Board:
    """ Return a starting SVG board """
    global b
    b = chess.Board()
    return chess.svg.board(board=b)


def is_valid_move(move: str) -> bool:
    global b
    if len(move) != 4 or '?' in move:
        return False

    m = chess.Move.from_uci(move)
    return m in b.legal_moves


def perform_move(move: str, ret_dict) -> None:
    """
    Tries to perform move on the board, returns True if successful
    :param move: UCI move
    """
    global b

    # TODO extend from legal move to "good move" by Polyglot or Stockfish
    board_move = chess.Move.from_uci(move)
    b.push(board_move)  # type: chess.Board


def suggest_moves() -> List[str]:
    """
    Returns all possible book responses to current position
    :return: List of move UCI strings
    """
    global b, reader
    games = reader.find_all(b)
    print('Book moves: ')
    moves = list()
    for entry in games:
        move = entry.move()
        # TODO classify suggestions depending on whether the move is known/bad/favorite
        print('{}: learn={}, weight={}'.format(move.uci(), entry.learn, entry.weight))
        moves.append(move.uci())
    return moves
