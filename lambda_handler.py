"""AWS Lambda entry point: Function URL requests go to Flask; async self-invokes run the AI pipeline."""
from apig_wsgi import make_lambda_handler

import app

_web = make_lambda_handler(app.app, binary_support=True)


def handler(event, context):
    if "oci_sid" in event:
        app.run_job(event["oci_sid"])
        return {"ok": True}
    return _web(event, context)
