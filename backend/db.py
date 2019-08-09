import pymongo
import chess.polyglot
import chess.engine
from typing import List

conn = pymongo.MongoClient()
db = conn.chessdb

MAX_DEPTH = 15

engine = chess.engine.SimpleEngine.popen_uci('/usr/bin/stockfish')

def evaluate(b: chess.Board) -> int:
    return 0
    #return engine.analyse(b, 
    #        limit=chess.engine.Limit(time=0.5)
    #        )['score'].pov(chess.WHITE).cp

def insert_board(b: chess.Board, score: int, replies) -> bool:
    found = db.boards.find_one({'_id': b.fen()})
    def is_uci_unique(seq1, seq2):
        def setify_ucis(seq):
            return set([el['uci'] for el in seq])
        return setify_ucis(seq1) == setify_ucis(seq2)

    if found:
        if uci_sets_identical(found['replies'] == replies):
            # Skip union on (uci-)identical reply sets
            # Assumes identical scoring
            return False
        used_ucis = []
        union = []
        for elem in replies + found['replies']:
            uci = elem['uci']
            if uci not in used_ucis:
                used_ucis.append(uci)
                union.append(elem)
        found['replies'] = union
        return bool(db.boards.save(found))
    else:
        db_board = {'_id': b.fen(), 'score': score, 'replies': replies}
        return bool(db.boards.insert_one(db_board))


def read_file(bin_file_name, uci_moves=[]):
    reader = chess.polyglot.open_reader(bin_file_name)
    b = chess.Board()

    def rec_adder(last_score, depth=0):
        if depth > MAX_DEPTH:
            return
        replies = []
        for entry in reader.find_all(b):
            move = entry.move
            if depth < len(uci_moves) and move.uci() != uci_moves[depth]:
                continue
            b.push(move)
            found = db.boards.find_one({'_id': b.fen()})
            if depth < len(uci_moves) or not found:
                score = evaluate(b)
                db_move = {
                        'to_fen': b.fen(),
                        'uci': move.uci(),
                        'weight': entry.weight,
                        'delta': score - last_score
                        }
                replies.append(db_move)

                rec_adder(score, depth+1)
                b.pop()
        insert_board(b, last_score, replies)

    root_ids = rec_adder(0)


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

