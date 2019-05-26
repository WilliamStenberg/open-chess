"""
When run, starts the backend Flask server at port 4999
"""
from backend import app, server

if __name__ == '__main__':
    app.run(debug=True, threaded=True, host='0.0.0.0', port=4999)
