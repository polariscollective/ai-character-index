# The Cloud Run Job's image: the judging engine, and nothing else.
#
# No site, no reader, no Next: those are served from Vercel. This container
# receives an ACI_JOB_ID and an ACI_JOB_MODE through environment variables --
# Cloud Run Jobs substitute variables, not arguments -- reads that job's row for
# what to do, and writes what it did back onto the same row.
#
# Three modes, one image: compose prices a run and writes its calls, judge
# executes them, publish builds the three payloads the reader serves. A mode is
# a string rather than a deployment.
FROM python:3.12-slim

WORKDIR /app

# The dependency first, the code afterwards: without this, changing one line of
# Python reinstalls the provider SDK on every build. `openai` is the only one --
# every provider is reached through an OpenAI-compatible endpoint, and the rest
# of the engine is standard library by design.
RUN pip install --no-cache-dir "openai>=1.0"

# Node, for the one builder that is not Python. engine/build-links-data.mjs imports
# app/lib/links.mjs, the assembly the reader route already used: a Python port would
# be a second copy of it, and this repository has published wrong figures off exactly
# that kind of drift before. So the image carries a Node runtime and the two files
# that builder's import graph actually reaches: links.mjs and the supabase.mjs it
# imports in turn. Not the site, beyond the two board files a publication
# freezes, not the reader, not Next, and not the rest of app/lib
# either -- no Slack client, no submissions, no feedback, no admin data.
RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

COPY engine/ ./engine/
COPY app/lib/links.mjs app/lib/supabase.mjs ./app/lib/
# The two boards a publication freezes (engine/publish.py BOARD_FILES).
COPY site/constitutions.json site/governance.json ./site/
ENV PYTHONPATH=/app/engine

# Only the OpenRouter key reaches this container, and that is a requirement
# rather than an economy: harness.resolve prefers a native route whenever that
# provider's key is present, so a stray ANTHROPIC_API_KEY here would silently
# send the Anthropic seat direct.
CMD ["python", "engine/job.py"]
