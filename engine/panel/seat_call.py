"""One call to one seat's model, made or priced.

Shared by the depth ladder and the assessment of a document as a whole, which
both ask a seat's own model first and its declared substitutes after, and both
need to know what each call cost. The model call is injected, so everything
built on this runs against a script in the tests.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / "spec-cite"))

import batch_job                 # noqa: E402
import whole_doc                 # noqa: E402

h = batch_job.h

# Four characters per token is the estimate the panel's own cost notes use.
CHARS_PER_TOKEN = 4


def ask(tag, system, user, config, call_model):
    """One call to `tag`'s model, through the route and with the settings the
    panel gives it, and what it cost. A refusal the call raises is raised to the
    caller, which records it and goes on."""
    provider, model_id = h.resolve(tag, config)
    kwargs = whole_doc.judge_kwargs(tag, model_id, config)
    reply, usage, finish_reason, seconds = call_model(
        provider=provider, model_id=model_id, system=system, user=user, kwargs=kwargs)
    return {"reply": reply or "", "usage": usage, "finish_reason": finish_reason,
            "seconds": seconds, "cost_usd": batch_job.cost_of(tag, usage, config),
            "provider": provider, "model_id": model_id, "kwargs": kwargs}


def priced(tag, system, user, output_tokens, config):
    """What one call to `tag` would cost, its input estimated from its length and
    its output from an allowance. A model with no price costs nothing here."""
    usage = {"prompt_tokens": (len(system) + len(user)) // CHARS_PER_TOKEN,
             "completion_tokens": output_tokens}
    return batch_job.cost_of(tag, usage, config) or 0.0
