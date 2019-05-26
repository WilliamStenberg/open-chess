"""
Backend is a web server, the Flask app is defined below and can be started with app.run()
"""
from flask import Flask
from flask_cors import CORS

# Used to @route('/')-serve the production code in frontend/build directory
npm_root = '../frontend'
template_folder = npm_root + '/build'
static_folder = template_folder + '/static'

app = Flask(__name__, static_folder=static_folder, template_folder=template_folder)
CORS(app)
