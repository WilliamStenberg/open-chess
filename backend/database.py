"""
database.py
Handles Mongo DB for open-chess
"""
import pymongo
import chess.polyglot
import chess.engine
from chess import Move
from typing import List

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

    def rec_adder(depth=0):
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


def populate_db():
    db.boards.delete_many({})
    print('Importing Spanish')
    read_file('../Titans.bin', [
        'e2e4', 'e7e5',
        'g1f3', 'b8c6',
        'f1b5'])
    #print('Importing Caro-Kann')
    #read_file('../Titans.bin', [
    #    'e2e4', 'c7c6'])

