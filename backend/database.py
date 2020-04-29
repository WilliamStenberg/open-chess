"""
database.py
Handles Mongo DB for open-chess
"""
from typing import List, Dict
import chess.engine
import chess.pgn
import chess.polyglot
from chess.pgn import Game
import pymongo
import bson

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


def read_polyglot_file(bin_file_name, uci_moves=None):
    """
    Read a Polyglot-compatible game file, starting with a set
    of given move UCI:s.
    Populates database, returns None
    """
    reader = chess.polyglot.open_reader(bin_file_name)
    b = chess.Board()

    if not uci_moves:
        uci_moves = []

    def rec_adder(depth):
        if depth > MAX_DEPTH:
            return
        replies = []
        for entry in reader.find_all(b):
            move = entry.move
            if depth < len(uci_moves) and move.uci() != uci_moves[depth]:
                continue
            san = b.san(move)
            b.push(move)
            db_move = {
                'leads_to': b.fen(),
                'uci': move.uci(),
                'san': san,
                'score_diff': None
                }
            replies.append(db_move)

            rec_adder(depth+1)
            b.pop()
        insert_board(b.fen(), replies)
    rec_adder(0)


def parse_pgn_game(pgn: Game):
    """ Parse a PGN game object and add it and its moves to DB """
    print('Parsing PGN game...')
    game_id = bson.ObjectId()

    def is_int(var: str) -> bool:
        """ Converter for ELO strings """
        try:
            int(var)
        except ValueError:
            return False
        return True
    db_game = {
        '_id': game_id,
        'date': pgn.headers['Date'] if 'Date' in pgn.headers else '???',
        'white': pgn.headers['White'] if 'White' in pgn.headers else '???',
        'white_elo': int(pgn.headers['WhiteElo']) if (
            'WhiteElo' in pgn.headers
            and is_int(pgn.headers['WhiteElo'])) else 0,
        'black': pgn.headers['Black'] if 'Black' in pgn.headers else '???',
        'black_elo': int(pgn.headers['BlackElo']) if (
            'BlackElo' in pgn.headers
            and is_int(pgn.headers['BlackElo'])) else 0,
        'result': pgn.headers['Result'] if 'Result' in pgn.headers else '???'
        }
    if db.games.find_one({k: v for k, v in db_game.items() if k != '_id'}):
        print('SKIPPED!')
        return
    print('Inserting:', db_game)
    db.games.insert_one(db_game)
    white_theory = db_game['white_elo'] >= 2500
    black_theory = db_game['black_elo'] >= 2500
    turn = True
    b = chess.Board()
    for i, move in enumerate(pgn.mainline_moves()):
        san = b.san(move)
        b.push(move)
        db_move = {
            'leads_to': b.fen(),
            'uci': move.uci(),
            'san': san,
            'score_diff': None
            }
        b.pop()  # ugly, but we need the original position
        if (turn and white_theory) or (not turn and black_theory):
            insert_board(b.fen(), [db_move], [], game_id if i > 5 else None)
        else:
            insert_board(b.fen(), [], [db_move], game_id if i > 5 else None)
        b.push(move)  # so now we put it back
        turn = not turn
        if i > MAX_DEPTH:
            break


def read_pgn_file(pgn_file_name, limit=0):
    """ Loop through all PGN games in a PGN file, call parser """
    with open(pgn_file_name) as f:
        pgn = chess.pgn.read_game(f)
        count = 0
        while pgn:
            parse_pgn_game(pgn)
            pgn = chess.pgn.read_game(f)
            count += 1
            if count >= limit and limit != 0:
                break


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


def crawl_troubleshoot_scoring(adjust=False):
    """ Will report on inconsistencies, might correct obvious errors """
    b = chess.Board()
    cursor = db.boards.find_one({'_id': b.fen()})

    def rec_crawler():
        """ Walks and looks for oddities """
        nonlocal cursor
        if not cursor:
            return
        if cursor['score'] is None:
            return
        for move in cursor['theory'] + cursor['moves']:
            if move['score_diff'] is not None:
                future = db.boards.find_one({'_id': move['leads_to']})
                if future:
                    if future['score'] is None:
                        if not adjust:
                            print('Found a board lacking score')
                            print(cursor)
                            print('and problem is below:')
                            print(future)
                        if adjust and cursor['score'] is not None:
                            print('Fixing a board lacking score!')
                            fix_score = -(cursor['score'] + move['score_diff'])
                            db.boards.update_one(
                                {'_id': future['_id']},
                                {'$set': {'score': fix_score}})
            safe = cursor.copy()
            cursor = db.boards.find_one({'_id': move['leads_to']})
            rec_crawler()
            cursor = safe
    rec_crawler()


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


def crawl_evaluate(uci_moves=None):
    """ Recursive evaluator """
    global engine
    try:
        engine.options
    except chess.engine.EngineTerminatedError:
        print('Restarting engine')
        engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')

    b = chess.Board()
    cursor = db.boards.find_one({'_id': b.fen()})
    set_position_score(cursor['_id'], 0)
    cursor = db.boards.find_one({'_id': b.fen()})

    if not uci_moves:
        uci_moves = []

    def rec_crawler(depth):
        """ Recursive evaluating function """
        nonlocal cursor
        if not cursor:
            # Done!
            return
        # Those that shall be recursed into
        target_moves = cursor['theory'] + cursor['moves']
        if depth < len(uci_moves):
            target_moves = [tm for tm in target_moves
                            if tm['uci'] == uci_moves[depth]]
        # Those that shall be analysed
        root_moves = [chess.Move.from_uci(tm['uci'])
                      for tm in target_moves if tm['score_diff'] is None]
        if root_moves:
            analyse_position(cursor, b, root_moves)

        for move_obj in target_moves:
            b.push_uci(move_obj['uci'])
            cursor = db.boards.find_one({'_id': b.fen()})
            rec_crawler(depth+1)
            b.pop()
            cursor = db.boards.find_one({'_id': b.fen()})

    rec_crawler(0)


def populate_db():
    """ Quickhand way to import Polyglot from Titans file """
    print('Importing Spanish')
    read_polyglot_file('../Titans.bin', [
        'e2e4', 'e7e5',
        'g1f3', 'b8c6',
        'f1b5'])

    print('Importing Caro-Kann')
    read_polyglot_file('../Titans.bin', [
        'e2e4', 'c7c6'])
