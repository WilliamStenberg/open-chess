FROM node:16


ENV PORT 3000

# Create app directory
RUN mkdir -p /usr/src

# Install dependencies
ADD ../frontend /usr/src/frontend
# Define the working directory of our Docker container
WORKDIR /usr/src/frontend
RUN npm install


# Build app
# RUN npm run build

# Expose our Next.js web application port
EXPOSE 3000

# Start the app
CMD ["npm", "run", "start", "--host", "0.0.0.0"]
