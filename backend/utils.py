"""
utils.py
Data importing, troubleshooting and exploration tools
for open-chess database
"""
import bson
import chess
import chess.engine
from chess.pgn import Game
import backend.database as database
from backend.database import db

engine = database.engine


def crawl_evaluate(uci_moves=None):
    """ Recursive evaluator """
    global engine
    try:
        engine.options
    except chess.engine.EngineTerminatedError:
        print('Restarting engine')
        engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')

    b = chess.Board()
    cursor = database.find_cursor(b.fen())
    database.set_position_score(cursor['_id'], 0)
    cursor = database.refresh_cursor(cursor)

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
            database.analyse_position(cursor, b, root_moves)

        for move_obj in target_moves:
            b.push_uci(move_obj['uci'])
            cursor = database.find_cursor(b.fen())
            rec_crawler(depth+1)
            b.pop()
            cursor = database.find_cursor(b.fen())

    rec_crawler(0)


def crawl_troubleshoot_scoring(adjust=False):
    """ Will report on inconsistencies, might correct obvious errors """
    b = chess.Board()
    cursor = database.find_cursor(b.fen())

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
            idatabase.insert_board(b.fen(), [db_move], [], game_id if i > 5 else None)
        else:
            idatabase.insert_board(b.fen(), [], [db_move], game_id if i > 5 else None)
        b.push(move)  # so now we put it back
        turn = not turn
        if i > database.MAX_DEPTH:
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
        if depth > database.MAX_DEPTH:
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
        database.insert_board(b.fen(), replies)
    rec_adder(0)


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
