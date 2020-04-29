"""
server.py
Launching a Flask server to host open-chess backen
"""
from typing import Dict, Tuple
from flask import jsonify, request, render_template
from backend import app, motor
from backend.database import list_favorites, remove_favorite


def json_ok(ret_dict: Dict) -> Tuple[Dict, int]:
    """ Formats the JSON dict with success HTTP code for Flask return """
    return jsonify(ret_dict), 200


def json_fail(message: str) -> Tuple[Dict, int]:
    """ Formats JSON with error and bad HTTP code """
    return jsonify({'err': message}), 400


@app.route('/')
def root():
    """ Static-serving most recent frontend build """
    return render_template('index.html')


@app.route('/auth', methods=['POST'])
def client_login():
    """ Name handling from new client setting cookies """
    if not request.is_json or 'name' not in request.json:
        return json_fail('No name in JSON request')
    name = request.json['name']

    return json_ok({'key': name})


@app.route('/svg', methods=['POST'])
def supply_svg():
    """ Returns an empty SVG board """
    if not request.is_json:
        return json_fail('Could not supply SVG: Expected JSON')
    req_json = request.json
    if 'is_white' not in req_json:
        return json_fail('Could not supply SVG: No color supplied')
    svg = motor.get_empty_board(bool(req_json['is_white']))
    return json_ok({'svg': svg})


@app.route('/explore/move', methods=['POST'])
def flask_explore_move():
    """ Tries to perform JSON dict['move'] as UCI move on the board"""
    if not request.is_json:
        return json_fail('Could not parse request: Expected JSON')
    req_json = request.json
    if 'move' not in req_json:
        return json_fail('Could not parse request: No moves')

    move = motor.promote_uci(req_json['move'])
    if not motor.is_valid_move(move):
        return json_fail('Not a valid move')
    ret_dict = {'success': True}
    ret_dict['moves'] = [motor.game_move(move)]
    return json_ok(ret_dict)


@app.route('/practise/move', methods=['POST'])
def flask_practise_move():
    """ Tries to perform JSON dict['move'] as UCI move on the board"""
    if not request.is_json:
        return json_fail('Could not parse request: Expected JSON')
    req_json = request.json
    if 'move' not in req_json:
        return json_fail('Could not parse request: No move')
    move = motor.promote_uci(req_json['move'])
    if not motor.is_valid_move(move):
        return json_fail('Not a valid move')

    if motor.is_good_move(move):
        ret_dict = {'success': True, 'moves': []}
        ret_dict['moves'].append(motor.game_move(move))
        ret_dict['moves'].append(motor.push_practise_move())
    else:
        ret_dict = {'success': False, 'moves': []}
    return json_ok(ret_dict)


@app.route('/analyse', methods=['POST'])
def flask_prompted_analysis():
    """ Trigger an analysis and return suggestions """
    ret_dict = {'success': True}
    motor.trigger_analysis()
    ret_dict['suggestions'] = motor.suggest_moves()
    return json_ok(ret_dict)


@app.route('/back', methods=['POST'])
def flask_step_back():
    """
    Tries to back, returns a ret_dict with most fields empty,
    because the client holds revert information
    """
    req_json = request.json

    if 'plies' not in req_json:
        return json_fail('No ply count given')
    try:
        plies = int(req_json['plies'])
    except ValueError:
        return json_fail('Bad ply count given')
    if not motor.can_step_back(plies):
        return json_fail(f'Cannot step {plies} back')
    for _ in range(plies):
        motor.step_back()
    ret_dict = {'success': True, 'suggestions': motor.suggest_moves()}
    return json_ok(ret_dict)


@app.route('/forward', methods=['POST'])
def flask_step_forward():
    """
    Tries to back, returns a ret_dict with most fields empty,
    because the client holds revert information
    """
    req_json = request.json

    if 'moves' not in req_json:
        return json_fail('No moves given')

    ret_dict = {'success': True, 'moves': []}
    for move_uci in req_json['moves']:
        ret_dict['moves'].append(motor.game_move(move_uci))
    return json_ok(ret_dict)


@app.route('/favorites/add', methods=['POST'])
def flask_add_favorite():
    """ Try to add favorite, return simple stringdict """
    req_json = request.json
    if 'name' not in req_json:
        return json_fail('No name given')

    inserted = motor.add_position_as_favorite(req_json['name'])
    if inserted:
        return json_ok({'success': True})
    return json_fail('Favorite already exists!')


@app.route('/favorites/remove', methods=['POST'])
def flask_remove_favorite():
    """ Try to add favorite, return simple stringdict """
    req_json = request.json
    if 'name' not in req_json:
        return json_fail('No name given')

    removed = remove_favorite(req_json['name'])
    if removed:
        return json_ok({'success': True})
    return json_fail('Favorite not found')


@app.route('/favorites/list', methods=['POST'])
def flask_list_favorites():
    """ Try to add favorite, return simple stringdict """
    seq = list_favorites()
    print('Listing faves')
    print(seq)
    return json_ok({'favorites': seq})


@app.route('/favorites/load', methods=['POST'])
def flask_load_favorite():
    """
    Populates a large ret_dict with reproducing
    steps for a favorite board
    """
    req_json = request.json
    if 'name' not in req_json:
        return json_fail('No name given')
    ret_dict = {'success': True}
    name = req_json['name']
    success = motor.load_favorite_by_name(name, ret_dict)
    if not success:
        return json_fail('Could not load favorite '+name)
    return json_ok(ret_dict)


@app.route('/unlink', methods=['POST'])
def flask_unlink_suggestion():
    """
    Attempts to unlink the suggestion uci given
    """
    req_json = request.json
    if 'move' not in req_json:
        return json_fail('No move given to unlink')
    move = motor.promote_uci(req_json['move'])
    if not motor.is_valid_move(move):
        return json_fail('Invalid move given to unlink')
    if not motor.game_unlink_move(move):
        return json_fail('Server could not unlink move')
    ret_dict = {'success': True, 'suggestions': motor.suggest_moves()}
    return json_ok(ret_dict)
