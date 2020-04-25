"""
server.py
Launching a Flask server to host open-chess backen
"""
from flask import jsonify, request, render_template
from backend import app, motor


@app.route('/')
def root():
    """ Static-serving most recent frontend build """
    return render_template('index.html')


@app.route('/auth', methods=['POST'])
def client_login():
    """ Name handling from new client setting cookies """
    if not request.is_json or 'name' not in request.json:
        return jsonify({'err': 'No name in JSON request'}), 403
    name = request.json['name']

    # TODO: Store user's name to associate all their requests with Board

    return jsonify({'key': name}), 200


@app.route('/svg', methods=['POST'])
def supply_svg():
    """ Returns an empty SVG board """
    if not request.is_json:
        return jsonify({'err': 'Could not supply SVG: Expected JSON'}), 400
    req_json = request.json
    if not 'is_white' in req_json:
        return jsonify({'err': 'Could not supply SVG: No color supplied'}), 400
    svg = motor.get_empty_board(bool(req_json['is_white']))
    return jsonify({'svg': svg}), 200


@app.route('/explore/move', methods=['POST'])
def flask_explore_move():
    """ Tries to perform JSON dict['move'] as UCI move on the board"""
    if not request.is_json:
        return jsonify({'err': 'Could not parse request: Expected JSON'}), 400
    req_json = request.json
    print('err here', req_json)
    if 'moves' not in req_json:
        return jsonify({'err': 'Could not parse request: No moves'}), 400

    moves = req_json['moves']
    ret_dict = {'success': True}
    for move in moves:
        if not motor.is_valid_move(move):
            return jsonify({'err': 'Not a valid move'}), 402
        motor.game_move(move, ret_dict)
    ret_dict['suggestions'] = motor.suggest_moves()
    return jsonify(ret_dict), 200


@app.route('/practise/move', methods=['POST'])
def flask_practise_move():
    """ Tries to perform JSON dict['move'] as UCI move on the board"""
    if not request.is_json:
        return jsonify({'err': 'Could not parse request: Expected JSON'}), 400
    req_json = request.json
    if 'moves' not in req_json:
        return jsonify({'err': 'Could not parse request: No move'}), 400
    move = req_json['moves'][0]
    if not motor.is_valid_move(move):
        return jsonify({'err': 'Not a valid move'}), 402

    if motor.is_good_move(move):
        ret_dict = {'success': True}
        motor.game_move(move, ret_dict)
        motor.push_practise_move(ret_dict)
    else:
        ret_dict = {'success': False, 'updates': []}
    ret_dict['suggestions'] = motor.suggest_moves()
    print(ret_dict)
    return jsonify(ret_dict), 200


@app.route('/analyse', methods=['POST'])
def flask_prompted_analysis():
    """ Trigger an analysis and return suggestions """
    ret_dict = {'success': True}
    motor.trigger_analysis()
    ret_dict['suggestions'] = motor.suggest_moves()
    return jsonify(ret_dict), 200


@app.route('/back', methods=['POST'])
def flask_step_back():
    """
    Tries to back, returns a ret_dict with most fields empty,
    because the client holds revert information
    """
    if not motor.can_step_back():
        return jsonify({'err': 'Cannot step back'}), 402

    motor.step_back()
    req_json = request.json
    if 'practise' in req_json and req_json['practise']:
        print('Double back')
        motor.step_back()
    return jsonify({'success': True}), 200


@app.route('/favorites/add', methods=['POST'])
def flask_add_favorite():
    """ Try to add favorite, return simple stringdict """
    req_json = request.json
    if 'name' not in req_json:
        return jsonify({'err': 'No name given'}), 400

    inserted = motor.add_position_as_favorite(req_json['name'])
    if inserted:
        return jsonify({'success': True}), 200
    return jsonify({'err': 'Favorite already exists!'}), 400


@app.route('/favorites/remove', methods=['POST'])
def flask_remove_favorite():
    """ Try to add favorite, return simple stringdict """
    req_json = request.json
    if 'name' not in req_json:
        return jsonify({'err': 'No name given'}), 400

    removed = motor.remove_position_as_favorite(req_json['name'])
    if removed:
        return jsonify({'success': True}), 200
    return jsonify({'err': 'Favorite not found'}), 400
    

@app.route('/favorites/list', methods=['POST'])
def flask_list_favorites():
    """ Try to add favorite, return simple stringdict """
    seq = motor.get_favorite_list()
    return jsonify({'favorites': seq}), 200


@app.route('/favorites/load', methods=['POST'])
def flask_load_favorite():
    """
    Populates a large ret_dict with reproducing
    steps for a favorite board
    """
    req_json = request.json
    if 'name' not in req_json:
        return jsonify({'err': 'No name given'}), 400
    ret_dict = {'success': True}
    name = req_json['name']
    success = motor.load_favorite_by_name(name, ret_dict)
    if not success:
        return jsonify({'err': 'Could not load favorite '+name}), 400
    ret_dict['suggestions'] = motor.suggest_moves()
    return jsonify(ret_dict), 200
