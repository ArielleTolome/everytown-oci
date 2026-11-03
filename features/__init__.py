"""Optional feature modules. Each `features/<name>.py` defines a Flask Blueprint named `bp`;
`features/<name>.sql` (optional) holds its idempotent schema, applied by `python3 -m db migrate`."""
import importlib
import pkgutil


def blueprints():
    for mod in sorted(pkgutil.iter_modules(__path__), key=lambda m: m.name):
        bp = getattr(importlib.import_module("%s.%s" % (__name__, mod.name)), "bp", None)
        if bp is not None:
            yield bp
