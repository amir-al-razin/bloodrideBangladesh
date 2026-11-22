"""Start the API:  python run.py   (add --reload while developing).

On Windows, psycopg's async mode needs the selector event loop, not the default proactor loop,
so the server is started here instead of with the plain `uvicorn` command.
"""
import asyncio
import os
import sys

import uvicorn

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

if __name__ == "__main__":
    if "--reload" in sys.argv:
        # the reloader runs the app in a subprocess that uvicorn starts with a selector loop
        uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True, loop="asyncio")
    else:
        server = uvicorn.Server(uvicorn.Config("app.main:app", host=HOST, port=PORT, loop="none"))
        asyncio.run(server.serve(), loop_factory=asyncio.SelectorEventLoop)
