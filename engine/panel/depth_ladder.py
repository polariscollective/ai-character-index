"""A depth out of ten, given through a ladder of attempts.

A depth call whose reply gives no whole number from 0 to 10 is asked again,
first with a format reminder, then with a one-shot example
(`depth_call.REMINDERS_OF_TEN`). If it is still off the scale, the seat's
declared substitutes give it in turn, each tried plain and then with the format
reminder. The first attempt that parses answers, and every attempt is kept and
costed. An attempt that raised keeps what it raised, so a substitute's reason
can say whether the seat's own model replied off the scale or never replied.

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

# Why a substitute gave the depth, from what the seat's own attempts did: every
# one came back and parsed nothing; every one raised; or some of each.
SUBSTITUTION_REASON = "off-scale reply after two reminders"
RAISED_EVERY_TIME = "the seat's model raised on every attempt: "
RAISED_OR_OFF_SCALE = "the seat's model raised or replied off the scale"
ALREADY_SEATED = "already seated"
# The reminders each candidate is asked with, in order: the seat's own model
# plain and then with each reminder, a substitute plain and then with the first.
SEAT_REMINDERS = (0, 1, 2)
SUBSTITUTE_REMINDERS = (0, 1)
# What a raised attempt keeps of its exception, type and message together.
ERROR_CHARS = 300


def _sum(values):
    known = [value for value in values if value is not None]
    return sum(known) if known else None


def attempts_at_most(tag, config, panel="frontier_fast"):
    """[(model, reminder)] for every call `give` can make for `tag`, in the
    order it makes them, before anything is known about which substitute is
    already seated: the most a depth can cost."""
    substitutes = config.get("substitutes", {}).get(panel, {}).get(tag, [])
    return ([(tag, reminder) for reminder in SEAT_REMINDERS]
            + [(substitute, reminder) for substitute in substitutes
               for reminder in SUBSTITUTE_REMINDERS])


def user_for(user, reminder):
    """The user message of an attempt: `user` itself, or with its reminder."""
    return user if reminder == 0 else depth_call.retry_user(user, reminder)


def substitution_reason(own):
    """Why a substitute gave the depth, from `own`, the seat's own attempts:
    off the scale only when every one came back and parsed nothing, a model
    that raised when every one raised, naming the first error, and both
    otherwise."""
    raised = [attempt for attempt in own if "error" in attempt]
    if not raised:
        return SUBSTITUTION_REASON
    if len(raised) == len(own):
        return RAISED_EVERY_TIME + raised[0]["error"]
    return RAISED_OR_OFF_SCALE


def metered(answered, field):
    """`field` summed over the replies that came back, None when none did.

    The caller of `give` needs this when `give` never returns: a stop mid-ladder
    leaves it holding `answered`, and the tokens on those replies are what it
    has to write beside the cost it already writes."""
    if field == "seconds":
        return _sum(answer["seconds"] for answer in answered)
    return _sum((answer["usage"] or {}).get(field) for answer in answered)


def give(tag, system, user, config, call_model, panel="frontier_fast", seated=None,
         attempts=None, answered=None):
    """One seat's depth out of ten: `tag`'s own model three times (plain, then
    each reminder), then each of `tag`'s declared substitutes in `panel` twice
    (plain, then the first reminder), until an attempt parses.

    `seated` is every model already giving a depth for this call's cell: a
    declared substitute that is one of them is skipped rather than asked, so no
    model gives two of one cell's depths, and the skip is recorded in
    `attempts` as {"model", "reason": ALREADY_SEATED, "parsed": False}, with no
    cost. `tag`'s own model is always asked, whether or not it is in `seated`.
    Omitted or empty, nothing is ever skipped, which is how the pilot calls
    this and must go on behaving.

    `attempts` may be a list the caller holds, filled in place as each call
    comes back or raises, so a `KeyboardInterrupt`, a `SystemExit` or a
    `seat_call.Unreachable`, which are not caught here and propagate at once,
    still leave the caller holding every attempt already billed. Omitted, a
    list of its own is used. `answered` is the same arrangement for the replies
    that came back, which carry the meters an attempt does not: pass a list, and
    `metered` reads the tokens and the seconds off it after a stop. A model that
    could not be reached through every wait is not an attempt that failed:
    nothing is appended for it, and no later attempt or substitute is asked. A
    rate limit or a server error that outlasts every wait is: its provider was
    reached, so it is an attempt that raised, and the ladder goes on.

    Returns {"depth", "rationale", "model", "substitution_reason", "attempts",
    "replies", "prompt_tokens", "completion_tokens", "seconds"}:

    - `depth` and `rationale` are None when nothing parsed;
    - `model` is the model that answered, `tag` itself unless a substitute did,
      and `tag` when nothing answered;
    - `substitution_reason` is set only when a substitute answered, and says
      what the seat's own attempts did (`substitution_reason` above);
    - `attempts` holds every call made, in order, each {"model", "reminder",
      "finish_reason", "cost_usd", "parsed"}, or the already-seated shape above
      for a substitute skipped rather than asked. A call that raised is an
      attempt that did not parse, with no cost and no finish_reason, and an
      "error" naming the exception's type and message, cut to 300 characters;
    - `replies` holds each attempt's reply text, index for index with
      `attempts`, None for an attempt that raised or was skipped as already
      seated;
    - the tokens and seconds are summed over the attempts that came back, None
      when none did."""
    seated = seated or ()
    attempts = [] if attempts is None else attempts
    answered = [] if answered is None else answered
    replies = []

    def try_once(model, reminder):
        try:
            answer = seat_call.ask(model, system, user_for(user, reminder), config, call_model)
        except seat_call.Unreachable:
            raise
        except Exception as raised:                    # noqa: BLE001
            attempts.append({"model": model, "reminder": reminder, "finish_reason": None,
                             "cost_usd": None, "parsed": False,
                             "error": f"{type(raised).__name__}: {raised}"[:ERROR_CHARS]})
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
        return {"depth": depth, "rationale": rationale, "model": model,
                "substitution_reason": substitution_reason,
                "attempts": attempts, "replies": replies,
                "prompt_tokens": metered(answered, "prompt_tokens"),
                "completion_tokens": metered(answered, "completion_tokens"),
                "seconds": metered(answered, "seconds")}

    start = len(attempts)
    for reminder in SEAT_REMINDERS:
        given = try_once(tag, reminder)
        if given is not None:
            return result(*given, tag, None)
    own = attempts[start:]

    for substitute in config.get("substitutes", {}).get(panel, {}).get(tag, []):
        if substitute in seated:
            attempts.append({"model": substitute, "reason": ALREADY_SEATED, "parsed": False})
            replies.append(None)
            continue
        for reminder in SUBSTITUTE_REMINDERS:
            given = try_once(substitute, reminder)
            if given is not None:
                return result(*given, substitute, substitution_reason(own))

    return result(None, None, tag, None)
