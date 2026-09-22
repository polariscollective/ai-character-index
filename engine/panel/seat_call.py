"""One call to one seat's model, made or priced.

Shared by the depth ladder and the assessment of a document as a whole, which
both ask a seat's own model first and its declared substitutes after, and both
need to know what each call cost. The model call is injected, so everything
built on this runs against a script in the tests.

A network error is not the model refusing. A call that cannot reach its model
(`TRANSPORT_ERRORS`) is asked again after each of `RETRY_WAITS`, and after the
last one it raises `Unreachable`, which stops whatever asked rather than handing
the seat to a substitute whose own model was never the problem.
"""

import http.client
import socket
import sys
import time
import urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                 # noqa: E402
import whole_doc                 # noqa: E402

h = batch_job.h

try:
    import openai
except ImportError:              # a publication build reads this module and calls no model
    openai = None

# What a call raises when it never reached the model, or the model's provider
# could not answer it for now: the connection, the name lookup, a timeout, a
# rate limit or the provider's own server error. An `HTTPError` is also a
# `URLError`, and is not one of these (`is_transport`): it is an answer.
TRANSPORT_ERRORS = ((openai.APIConnectionError, openai.RateLimitError,
                     openai.InternalServerError) if openai is not None else ()) + (
    ConnectionError, TimeoutError, socket.gaierror, http.client.HTTPException,
    urllib.error.URLError)
# Seconds waited before each new try, eight minutes for the last: a laptop's
# connection that drops for minutes at a time comes back inside them.
RETRY_WAITS = (30, 60, 120, 240, 480)
# What a wait's line and `Unreachable` keep of the error's message.
MESSAGE_CHARS = 200
# The wait itself. The tests replace it, so none of them sleeps.
sleep = time.sleep


class Unreachable(Exception):
    """A seat's model could not be reached through any of `RETRY_WAITS`.

    Never a candidate's failure: whoever asked stops, writes what it had
    already billed, and lets this propagate, as it does a KeyboardInterrupt."""


def is_transport(error):
    """Whether `error` says the call did not reach an answer, rather than that
    the provider answered it with a refusal."""
    return (isinstance(error, TRANSPORT_ERRORS)
            and not isinstance(error, urllib.error.HTTPError))


def described(error):
    """An error as its type and its message, the message cut to MESSAGE_CHARS."""
    return f"{type(error).__name__}: {str(error)[:MESSAGE_CHARS]}"


def stop_error(stopped, limit=1000):
    """What a row stopped by `stopped` records as its error: `unreachable: `
    and the message for a model that could not be reached, the message or the
    exception's name otherwise."""
    if isinstance(stopped, Unreachable):
        return f"unreachable: {stopped}"[:limit]
    return str(stopped)[:limit] or type(stopped).__name__

# Four characters per token is the estimate the panel's own cost notes use.
CHARS_PER_TOKEN = 4
# The output cap a model with no `max_output` is called with, as
# whole_doc.judge_kwargs sends it.
DEFAULT_MAX_OUTPUT = 32768
# Printed by every command that calls seats, when the variable is set: a native
# route is preferred whenever its provider's key is in the environment.
ANTHROPIC_KEY_NOTE = ("note: ANTHROPIC_API_KEY is set, so fable is called on Anthropic's own "
                      "API. The repository's .env has carried a stale key that answers 401; "
                      "unset it to go through OpenRouter, as the container does.")


def ask(tag, system, user, config, call_model):
    """One call to `tag`'s model, through the route and with the settings the
    panel gives it, and what it cost. A refusal the call raises is raised to the
    caller, which records it and goes on.

    A transport error is not a refusal: the same call is made again after each
    of RETRY_WAITS, one line on stderr per wait, and once the last wait has
    failed too, `Unreachable` is raised from the last error, naming the model
    and the error. Only the call that answers is returned, so only it is
    billed: a call that never reached the model has nothing to bill."""
    provider, model_id = h.resolve(tag, config)
    kwargs = whole_doc.judge_kwargs(tag, model_id, config)
    waits = RETRY_WAITS
    for tried in range(len(waits) + 1):
        try:
            reply, usage, finish_reason, seconds = call_model(
                provider=provider, model_id=model_id, system=system, user=user,
                kwargs=kwargs)
            break
        except Exception as error:                   # noqa: BLE001
            if not is_transport(error):
                raise
            if tried == len(waits):
                raise Unreachable(
                    f"{tag} ({model_id}) could not be reached in {tried + 1} tries over "
                    f"{sum(waits)} s of waiting: {described(error)}") from error
            print(f"{tag} could not be reached ({described(error)}); trying again in "
                  f"{waits[tried]} s", file=sys.stderr, flush=True)
            sleep(waits[tried])
    return {"reply": reply or "", "usage": usage, "finish_reason": finish_reason,
            "seconds": seconds, "cost_usd": batch_job.cost_of(tag, usage, config),
            "provider": provider, "model_id": model_id, "kwargs": kwargs}


def priced(tag, system, user, output_tokens, config):
    """What one call to `tag` would cost, its input estimated from its length and
    its output from an allowance. A model with no price costs nothing here."""
    usage = {"prompt_tokens": (len(system) + len(user)) // CHARS_PER_TOKEN,
             "completion_tokens": output_tokens}
    return batch_job.cost_of(tag, usage, config) or 0.0


def max_output(tag, config):
    """The most output `tag`'s model is allowed in one call: the cap
    whole_doc.judge_kwargs sends with it, so a call cannot be billed for more."""
    return config["models"].get(tag, {}).get("max_output", DEFAULT_MAX_OUTPUT)
