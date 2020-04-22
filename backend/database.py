"""
database.py
Handles Mongo DB for open-chess
"""
import chess.engine
from typing import List, Dict
import pymongo
import chess.polyglot

conn = pymongo.MongoClient()
db = conn.chessdb

MAX_DEPTH = 15

engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')


def insert_board(b: chess.Board, theory=[], other_moves=[], game=None) -> bool:
    found = db.boards.find_one({'_id': b.fen()})
    if found:
        existing_theory_ucis = map(lambda x: x['uci'], found['theory'])
        existing_move_ucis = map(lambda x: ['uci'], found['moves'])
        for elem in theory:
            if elem['uci'] in existing_theory_ucis:
                continue
            if elem['uci'] in existing_move_ucis:
                found['moves'] = [m for m in found['moves']
                                  if m['uci'] != elem['uci']]
                found['theory'].append(elem)

        for elem in other_moves:
            if elem['uci'] in existing_theory_ucis or \
               elem['uci'] in existing_move_ucis:
                continue
            found['moves'].append(elem)
        if game:
            found['games'].append(game)
        return bool(db.boards.save(found))

    db_board = {'_id': b.fen(), 'score': None,
                'theory': theory, 'moves': other_moves,
                'games': [game] if game else []}
    return bool(db.boards.insert_one(db_board))


def read_file(bin_file_name, uci_moves=[]):
    """
    Read a Polyglot-compatible game file, starting with a set
    of given move UCI:s.
    Populates database, returns None
    """
    reader = chess.polyglot.open_reader(bin_file_name)
    b = chess.Board()

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
            found = db.boards.find_one({'_id': b.fen()})
            if depth < len(uci_moves) or not found:
                db_move = {
                    'leads_to': b.fen(),
                    'uci': move.uci(),
                    'san': san,
                    'score_diff': None
                    }
                replies.append(db_move)

                rec_adder(depth+1)
            b.pop()
        insert_board(b, replies)
    rec_adder(0)


def set_position_score(fen, score: int):
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
    for i, theory_move in enumerate(cursor['theory']):
        if theory_move['uci'] in uci_score_dict.keys():
            diff = uci_score_dict[theory_move['uci']] - cursor['score']
            set_instructions[f'theory.{i}.score_diff'] = diff

            set_position_score(
                theory_move['leads_to'], -uci_score_dict[theory_move['uci']])

    for i, move in enumerate(cursor['moves']):
        if move['uci'] in uci_score_dict.keys():
            diff = uci_score_dict[move['uci']] - cursor['score']
            set_instructions[f'moves.{i}.score_diff'] = diff
            set_position_score(
                move['leads_to'], -uci_score_dict[move['uci']])
    db.boards.update_one({'_id': cursor['_id']},
                         {'$set': set_instructions})



def crawl_evaluate(uci_moves=[]):
    global cursor
    b = chess.Board()
    cursor = db.boards.find_one({'_id': b.fen()})
    set_position_score(cursor['_id'], 0)
    cursor = db.boards.find_one({'_id': b.fen()})

    def rec_crawler(depth):
        """ Recursive evaluating function """
        global cursor
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
                      for tm in target_moves if not tm['score_diff']]
        if root_moves:
            time_limit = chess.engine.Limit(
                time=min(5, max(2, len(root_moves))))
            lines = engine.analyse(
                b, time_limit,
                root_moves=root_moves,
                multipv=len(root_moves))
            uci_score_dict = {
                line['pv'][0].uci(): line['score'].relative.score()
                for line in lines}
            set_position_moves_scores(cursor, uci_score_dict)

        for move_obj in target_moves:
            b.push_uci(move_obj['uci'])
            cursor = db.boards.find_one({'_id': b.fen()})
            rec_crawler(depth+1)
            b.pop()
            cursor = db.boards.find_one({'_id': b.fen()})

    rec_crawler(0)

def populate_db():
    print('Importing Spanish')
    read_file('../Titans.bin', [
        'e2e4', 'e7e5',
        'g1f3', 'b8c6',
        'f1b5'])
    #print('Importing Caro-Kann')
    #read_file('../Titans.bin', [
    #    'e2e4', 'c7c6'])

