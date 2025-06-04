# Node.js Server

A basic Node.js server using Express.js.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following content:
```
PORT=3000
NODE_ENV=development
```

3. Start the server:
```bash
node src/server.js
```

The server will start on port 3000 by default. You can change the port in the `.env` file.

## API Endpoints

- `GET /`: Welcome message
  - Response: `{ "message": "Welcome to the API" }`

## Project Structure

```
.
├── src/
│   └── server.js
├── .env
├── package.json
└── README.md
``` 