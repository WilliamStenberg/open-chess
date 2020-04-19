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
        return jsonify('No name in JSON request'), 403
    name = request.json['name']

    # TODO: Store user's name to associate all their requests with Board

    return jsonify({'key': name}), 200


@app.route('/svg', methods=['POST'])
def supply_svg():
    """ Returns an empty SVG board """
    if not request.is_json:
        return jsonify('Could not supply SVG: Expected JSON'), 400
    req_json = request.json
    if not 'is_white' in req_json:
        return jsonify('Could not supply SVG: No color supplied'), 400
    svg = motor.get_empty_board(bool(req_json['is_white']))
    return jsonify({'svg': svg}), 200


@app.route('/move', methods=['POST'])
def flask_move():
    """ Tries to perform JSON dict['move'] as UCI move on the board"""
    if not request.is_json:
        return jsonify('Could not parse request: Expected JSON'), 400
    req_json = request.json
    if 'move' not in req_json:
        return jsonify('Could not parse request: No move'), 400
    move = req_json['move']
    if not motor.is_valid_move(move):
        return jsonify({'err': 'Not a valid move'}), 402

    ret_dict = {'success': True}
    motor.game_move(move, ret_dict)
    ret_dict['suggestions'] = motor.suggest_moves()
    print(ret_dict)
    return jsonify(ret_dict), 200


@app.route('/back', methods=['POST'])
def flask_step_back():
    """
    Tries to back, returns a ret_dict with most fields empty,
    because the client holds revert information
    """
    if not motor.can_step_back():
        return jsonify('Cannot step back'), 402

    motor.step_back()
    return jsonify({'success': True}), 200


