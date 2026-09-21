"""A depth out of ten, given through a ladder of attempts.

A depth call whose reply gives no whole number from 0 to 10 is asked again,
first with a format reminder, then with a one-shot example
(`depth_call.REMINDERS_OF_TEN`). If it is still off the scale, the seat's
declared substitutes give it in turn, each tried plain and then with the format
reminder. The first attempt that parses answers, and every attempt is kept and
costed.

Pure over plain data and a `call_model`: nothing here reads or writes the store
or a file. Every reply comes back in `replies` for the caller to keep.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import depth_call                # noqa: E402
import seat_call                 # noqa: E402

h = seat_call.h

SUBSTITUTION_REASON = "off-scale reply after two reminders"


def _sum(values):
    known = [value for value in values if value is not None]
    return sum(known) if known else None


def give(tag, system, user, config, call_model, panel="frontier_fast"):
    """One seat's depth out of ten: `tag`'s own model three times (plain, then
    each reminder), then each of `tag`'s declared substitutes in `panel` twice
    (plain, then the first reminder), until an attempt parses.

    Returns {"depth", "rationale", "model", "substitution_reason", "attempts",
    "replies", "prompt_tokens", "completion_tokens", "seconds"}:

    - `depth` and `rationale` are None when nothing parsed;
    - `model` is the model that answered, `tag` itself unless a substitute did,
      and `tag` when nothing answered;
    - `substitution_reason` is set only when a substitute answered;
    - `attempts` holds every call made, in order, each {"model", "reminder",
      "finish_reason", "cost_usd", "parsed"}. A call that raised is an attempt
      that did not parse, with no cost and no finish_reason;
    - `replies` holds each attempt's reply text, index for index with
      `attempts`, None for an attempt that raised;
    - the tokens and seconds are summed over the attempts that came back, None
      when none did."""
    attempts, replies, answered = [], [], []

    def try_once(model, reminder):
        this_user = user if reminder == 0 else depth_call.retry_user(user, reminder)
        try:
            answer = seat_call.ask(model, system, this_user, config, call_model)
        except Exception:                              # noqa: BLE001
            attempts.append({"model": model, "reminder": reminder, "finish_reason": None,
                             "cost_usd": None, "parsed": False})
            replies.append(None)
            return None
        answered.append(answer)
        depth, rationale = depth_call.parse(answer["reply"], scale=10)
        attempts.append({"model": model, "reminder": reminder,
                         "finish_reason": answer["finish_reason"],
                         "cost_usd": answer["cost_usd"], "parsed": depth is not None})
        replies.append(answer["reply"])
        return None if depth is None else (depth, rationale)

    def result(depth, rationale, model, substitution_reason):
        usage = [answer["usage"] or {} for answer in answered]
        return {"depth": depth, "rationale": rationale, "model": model,
                "substitution_reason": substitution_reason,
                "attempts": attempts, "replies": replies,
                "prompt_tokens": _sum(u.get("prompt_tokens") for u in usage),
                "completion_tokens": _sum(u.get("completion_tokens") for u in usage),
                "seconds": _sum(answer["seconds"] for answer in answered)}

    for reminder in (0, 1, 2):
        given = try_once(tag, reminder)
        if given is not None:
            return result(*given, tag, None)

    for substitute in config.get("substitutes", {}).get(panel, {}).get(tag, []):
        for reminder in (0, 1):
            given = try_once(substitute, reminder)
            if given is not None:
                return result(*given, substitute, SUBSTITUTION_REASON)

    return result(None, None, tag, None)
