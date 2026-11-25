"""Call a worker RPC synchronously in tests and evaluations."""
from uuid import uuid4
from papertrace import Worker


def call(worker, method, **params):
    after = []
    if method in Worker.writes:
        params["operation_id"] = uuid4().hex
    with worker.lock, worker.db:
        result = worker.call(method, params, after)
    for action in after:
        action()
    return result
