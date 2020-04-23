# open-chess
Python-chess Flask app serving a TypeScript React frontend that 
displays an interactive chess board.

![Alt text](img/colored_arrows.png?raw=true "Title")

## Install
Clone this repository, run `pip install -r requirements.txt` from project root
to install Python dependencies.

`cd` into the `frontend` folder and run `npm install` to install React dependencies.
This requires having installed Node.JS/npm.

This software requires a MongoDB database named `chessdb`, the `mongod` service
needs to be running on the same host as the server.

## Run
The frontend can be run through Node.JS development server with 
`npm run start`, or build to production code with `npm run build`.
`start`ing will launch the frontend app on `http://localhost:3000`, while `build`ing will 
populate the `frontend/build` directory with code that can be statically served by Flask.

The backend is started from the project root with `python3 app.py` or `flask run`,
and will run a Flask server on `http://localhost:4999`.

#### Static serving
After having run `npm run build`, the whole app can be accessed through 
`http://localhost:4999/` (i.e. the root of the Flask server). The Node.JS development 
is not needed.

#### Hot-reload serving
Running `npm run start` runs the frontend at port 3000, and updates continuously
as the frontend code is edited. The Flask server must still be running for the frontend
to be able to fetch data. This is useful for quick development.

## Reference
The software is documented [here](docs/architecture.pdf).

## License
This project is <i>Free Software</i>. Please refer to the GPL3 license for more information.
