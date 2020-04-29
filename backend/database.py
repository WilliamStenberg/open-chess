"""
database.py
Handles Mongo DB for open-chess
"""
from typing import List, Dict
import chess.engine
import chess.pgn
import chess.polyglot
import pymongo

conn = pymongo.MongoClient()
db = conn.chessdb

MAX_DEPTH = 25

engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')


def find_cursor(board_fen: str):
    """ Searches database for board with given FEN, returns cursor """
    return db.boards.find_one({'_id': board_fen})


def refresh_cursor(cursor):
    """ Finds the same cursor, giving the newest version """
    return find_cursor(cursor['_id'])


def find_favorite(name=None, board_fen=None):
    """
    Find favorite by either name or board FEN.
    Will try name first and returns on find, otherwise tries FEN before None
    """
    if name:
        found = db.favorites.find_one({'name': name})
        if found:
            return found
    elif board_fen:
        found = db.favorites.find_one({'fen': board_fen})
        if found:
            return found
    return None


def add_favorite(name: str, board: chess.Board) -> bool:
    """ Adds favorite, performs exist check first """
    if not name or find_favorite(name, board.fen()):
        return False
    favorite_object = {
        'name': name,
        'fen': board.fen(),
        'uci_stack': [m.uci() for m in board.move_stack]
    }
    db.favorites.insert_one(favorite_object)
    return True


def remove_favorite(name: str) -> bool:
    """ Finds a favorite by name and deletes it """
    if not find_favorite(name):
        return False
    return db.favorites.delete_one({'name': name}).deleted_count > 0


def list_favorites() -> List[str]:
    """ Fetch all favorites from DB and return their names """
    return list(map(lambda x: x['name'], db.favorites.find({})))


def insert_board(board_fen: str, theory=None, other_moves=None,
                 game=None, score=None) -> bool:
    """ Insert with updating, eventually moving from moves to theory """
    if not theory:
        theory = []
    if not other_moves:
        other_moves = []
    found = db.boards.find_one({'_id': board_fen})
    if found:
        existing_theory_ucis = list(map(lambda x: x['uci'], found['theory']))
        existing_move_ucis = list(map(lambda x: x['uci'], found['moves']))
        for elem in theory:
            if elem['uci'] in existing_theory_ucis:
                continue
            if elem['uci'] in existing_move_ucis:
                existing = [m for m in found['moves']
                            if m['uci'] == elem['uci']][0]
                found['moves'] = [m for m in found['moves']
                                  if m['uci'] != elem['uci']]
                found['theory'].append(existing)
            else:
                found['theory'].append(elem)

        for elem in other_moves:
            if elem['uci'] in existing_theory_ucis or \
               elem['uci'] in existing_move_ucis:
                continue
            found['moves'].append(elem)
        if game:
            found['games'].append(game)
        return bool(db.boards.save(found))

    db_board = {'_id': board_fen, 'score': score,
                'theory': theory, 'moves': other_moves,
                'games': [game] if game else []}
    return bool(db.boards.insert_one(db_board))


def unlink_move(board_fen: str, move_uci: str) -> bool:
    """
    Shallow remove of a move from either theory or moves on a board by FEN
    returns success status.
    """
    theory_result = db.boards.update_one({'_id': board_fen}, {
        '$pull': {'theory': {'uci': move_uci}}})
    if theory_result.modified_count > 0:
        return True
    moves_result = db.boards.update_one({'_id': board_fen}, {
        '$pull': {'moves': {'uci': move_uci}}})
    return moves_result.modified_count > 0


def set_position_score(fen: str, score: int):
    """ Update a position both locally and in DB """
    db.boards.update_one(
        {'_id': fen},
        {'$set': {'score': score}})


def set_position_moves_scores(cursor, uci_score_dict: Dict):
    """
    Update a position's theory and moves lists with
    "{'e2e4': 1}"-dict.
    This is done by crafting a large Mongo update command
    which requires the moves' array indices.
    """
    set_instructions = {}  # $set key-value pairs, with indices
    used_ucis = []  # used to know which to push entries for
    for i, theory_move in enumerate(cursor['theory']):
        if theory_move['uci'] in uci_score_dict.keys():
            diff = uci_score_dict[theory_move['uci']] - cursor['score']
            set_instructions[f'theory.{i}.score_diff'] = diff
            future = db.boards.find_one({'_id': theory_move['leads_to']})
            score = -uci_score_dict[theory_move['uci']]
            if future:
                set_position_score(theory_move['leads_to'], score)
            else:
                insert_board(theory_move['leads_to'], score=score)
            used_ucis.append(theory_move['uci'])

    for i, move in enumerate(cursor['moves']):
        if move['uci'] in uci_score_dict.keys():
            diff = uci_score_dict[move['uci']] - cursor['score']
            set_instructions[f'moves.{i}.score_diff'] = diff
            future = db.boards.find_one({'_id': move['leads_to']})
            score = -uci_score_dict[move['uci']]
            if future:
                set_position_score(move['leads_to'], score)
            else:
                insert_board(move['leads_to'], score=score)
            used_ucis.append(move['uci'])

    if set_instructions:
        db.boards.update_one({'_id': cursor['_id']},
                             {'$set': set_instructions})
    if len(used_ucis) < len(uci_score_dict):
        new_moves = []
        temp_board = chess.Board(cursor['_id'])
        for uci, score in uci_score_dict.items():
            if uci in used_ucis:
                continue
            san = temp_board.san(chess.Move.from_uci(uci))
            temp_board.push_uci(uci)

            diff = score - cursor['score']
            db_move = {
                'leads_to': temp_board.fen(),
                'uci': uci,
                'san': san,
                'score_diff': diff
                }
            new_moves.append(db_move)
            # empty fields for both theory and moves
            insert_board(temp_board.fen(), score=-score)
            temp_board.pop()

        db.boards.update_one({'_id': cursor['_id']},
                             {'$push': {'moves': {'$each': new_moves}}})


def analyse_position(eval_cursor, eval_board, root_moves=None, extended=False):
    """
    Commit analysis to DB.
    Can confine to given root moves,
    or search for new moves with extended=True
    """
    if root_moves:
        time_limit = chess.engine.Limit(
            time=min(5, max(2, len(root_moves))))
        lines = engine.analyse(
            eval_board, time_limit,
            root_moves=root_moves,
            multipv=len(root_moves))
    else:
        if extended:
            taken_ucis = list(map(
                lambda m: m['uci'],
                eval_cursor['theory'] + eval_cursor['moves']))
            scout_lines = engine.analyse(
                eval_board, chess.engine.Limit(time=0.3),
                multipv=len(taken_ucis) + 3)
            scouted_moves = list(map(lambda line: line['pv'][0], scout_lines))
            new_moves = [m for m in scouted_moves
                         if m.uci() not in taken_ucis]
            lines = engine.analyse(
                eval_board, chess.engine.Limit(time=3),
                root_moves=new_moves,
                multipv=len(new_moves))
        else:
            lines = engine.analyse(
                eval_board, chess.engine.Limit(time=2),
                multipv=3)

    uci_score_dict = {
        line['pv'][0].uci(): line['score'].relative.score(
            mate_score=100000)
        for line in lines}
    print(uci_score_dict)
    if any([v is None for v in uci_score_dict.values()]):
        print('Somehow, some score is None')
        print(uci_score_dict)
        print(lines)
    if eval_cursor['score'] is None:
        print('will crash now')
        print(eval_cursor)
        print(eval_board.move_stack)
    set_position_moves_scores(eval_cursor, uci_score_dict)
