# Official Python Docker images available at https://hub.docker.com/_/python
#   DEPRECATION: Python 2.7 reached the end of its life on January 1st, 2020.
FROM python:3
RUN apt-get update && apt-get install -yy sudo vim
RUN wget https://stockfishchess.org/files/stockfish_15.1_linux_x64.zip && unzip stockfish_15.1_linux_x64.zip && mv stockfish_15.1_linux_x64/stockfish-ubuntu-20.04-x86-64 /usr/bin/stockfish
RUN mkdir -p /code
WORKDIR /code

# Install our Python packages
ADD ./requirements.txt ./
RUN pip install -r requirements.txt

# Add our application code
ADD ./backend ./backend
ADD ./app.py ./
 
EXPOSE 4999

# Run our Python application
CMD ["python", "app.py"]
