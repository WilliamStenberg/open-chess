from flask import jsonify, request, render_template
from backend import app, motor
from backend.motor import is_valid_move


@app.route('/')
def root():
    """ Static-serving most recent frontend build """
    return render_template('index.html')


@app.route('/auth', methods=['POST'])
def client_login():
    """ Name handling from new client setting cookies """
    if not request.is_json or 'name' not in request.json:
        return 'No name in JSON request', 403
    name = request.json['name']

    # TODO: Store user's name to associate all their requests with a certain Board/session

    return jsonify({'key': name}), 200


@app.route('/svg', methods=['POST'])
def hello_world():
    """ Returns an empty SVG board """
    svg = motor.get_empty_board()
    if not request.is_json:
        return '', 400
    return jsonify({'svg': svg}), 200


@app.route('/move', methods=['POST'])
def flask_move():
    """ Tries to perform JSON dict['move'] as UCI move on the board"""
    if not request.is_json:
        return 'Could not parse request: Expected JSON', 400
    req_json = request.json
    if 'move' not in req_json:
        return 'Could not parse request: No move', 400
    move = req_json['move']
    if not is_valid_move(move):
        return 'Not a valid move', 402

    ret_dict = {'success': True}
    motor.perform_move(move, ret_dict)
    ret_dict['suggestions'] = motor.suggest_moves()
    return jsonify(ret_dict), 200
