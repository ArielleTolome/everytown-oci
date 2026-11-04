"""AWS Lambda entry point: Function URL requests go to Flask; async self-invokes run the AI pipeline."""
from apig_wsgi import make_lambda_handler

import app
import observability

_web = make_lambda_handler(app.app, binary_support=True)


def handler(event, context):
    try:
        if "oci_sid" in event:
            app.run_job(event["oci_sid"])  # the trace root for one report
            return {"ok": True}
        return _web(event, context)
    finally:
        # Lambda freezes the container after returning, so export now; flush() never raises.
        observability.flush(timeout_s=2 if "oci_sid" not in event else 5)
