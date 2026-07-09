import logging
import json
import traceback
from datetime import datetime, timezone
from typing import Any

_SKIP_KEYS = frozenset({
    'name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
    'filename', 'module', 'exc_info', 'exc_text', 'stack_info',
    'lineno', 'funcName', 'created', 'msecs', 'relativeCreated',
    'thread', 'threadName', 'processName', 'process', 'message',
    'taskName',
})


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj: dict[str, Any] = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'level':     record.levelname,
            'service':   'app-api',
            'message':   record.getMessage(),
            'logger':    record.name,
        }

        for key, val in record.__dict__.items():
            if key not in _SKIP_KEYS:
                log_obj[key] = val

        if record.exc_info:
            log_obj['error'] = {
                'type':      record.exc_info[0].__name__ if record.exc_info[0] else None,
                'message':   str(record.exc_info[1]),
                'traceback': traceback.format_exception(*record.exc_info),
            }

        return json.dumps(log_obj, default=str)


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


logger = get_logger('app-api')
