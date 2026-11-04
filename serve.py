"""Container entrypoint: the Flask JSON API plus the built Astro site on one port.

On AWS, CloudFront serves the site from S3 and only /api/* reaches the Lambda; this does the same in one process:
`gunicorn serve:app`. The site is the `frontend/dist` build (or OCI_STATIC_DIR).
"""
import os

from flask import abort, send_from_directory

from app import app

DIST = os.path.abspath(os.environ.get("OCI_STATIC_DIR") or os.path.join(os.path.dirname(__file__), "frontend", "dist"))


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def site(path):
    if path.startswith("api/"):
        abort(404)
    # Pages are folders with an index.html (trailingSlash "always"); send_from_directory rejects paths outside DIST.
    if os.path.isdir(os.path.join(DIST, path)):
        path = os.path.join(path, "index.html")
    return send_from_directory(DIST, path)
