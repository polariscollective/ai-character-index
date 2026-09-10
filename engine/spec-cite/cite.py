#!/usr/bin/env python3
"""spec-cite: resolve and verify precise citations into the mirrored specs.

Locator grammar (canonical form, see specs/CITATION.md):

    <spec>@<version> > <section-ref> > ¶<n>[ s<a>[-<b>]]
    <spec>@<version> > <section-ref> > ¶<n> s<a> - ¶<m> s<b>

  spec         constitution | model-spec (bundled), or any name a user
               manifest registers (see "User specs" below)
  section-ref  #anchor (model-spec) or heading path "Chapter > Section" (constitution)
  ¶<n>         block number within the section's direct span ("p<n>" also accepted)
  s<a>[-<b>]   sentence (range) within the block; omit for the whole block

  ">" and "›" are interchangeable path separators.

Commands:
    cite.py outline <spec>[@<version>]
    cite.py show    "<spec>[@<version>] > <section-ref>"
    cite.py resolve "<locator>"
    cite.py find    <spec>[@<version>] "<text>"

User specs:
    A manifest at specs/user/specs.json (gitignored, absent by default)
    registers additional spec documents without editing this file. Shape:

        {
          "<name>": {
            "<YYYY-MM-DD>": {
              "path": "<repo-relative .md path>",
              "default": true,
              "title": "<display title>",
              "sourceUrl": "<url of the canonical source>"
            }
          }
        }

    - Names match [a-z-]+ (the locator grammar's spec identifiers) and must
      not be the bundled names constitution / model-spec: a manifest that
      tries to redefine a bundled spec fails loudly.
    - "default" selects the version used when @<version> is omitted. It is
      optional when a spec has exactly one version, and at most one version
      per spec may carry it.
    - "path" resolves relative to the repo root (absolute paths also work),
      so the document itself can live anywhere, e.g. under specs/user/.
    - "title" and "sourceUrl" are optional rendering metadata for surfaces
      that display the spec (spec reader / panel UI); citation resolution
      ignores them. "title" passes through as given; when absent,
      spec_meta() derives it from the document's first heading.
      "sourceUrl" passes through; absent means no source link.
    - SPEC_CITE_USER_SPECS=<file> overrides the manifest location; the test
      suite uses this to exercise the feature without touching specs/.
    A malformed manifest fails loudly; an absent manifest is the normal
    bundled-only state, not an error.
"""

import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

BUNDLED_SPECS = {
    ("constitution", "2026-01-20"): "specs/claude-constitution/20260120-constitution.md",
    ("model-spec", "2025-12-18"): "specs/openai-model-spec/model_spec.md",
}
BUNDLED_DEFAULT_VERSION = {"constitution": "2026-01-20", "model-spec": "2025-12-18"}

USER_MANIFEST_PATH = REPO_ROOT / "specs" / "user" / "specs.json"
MANIFEST_ENV_VAR = "SPEC_CITE_USER_SPECS"

SPEC_NAME_RE = re.compile(r"^[a-z-]+$")
VERSION_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Effective registry: bundled specs merged with the user manifest (if any).
# Rebuilt by load_user_manifest(); never edit these by hand at runtime.
SPECS = {}
DEFAULT_VERSION = {}
# Rendering metadata from the manifest, keyed (name, version): a subset of
# {"title": str, "sourceUrl": str} carrying only the keys the entry gave.
USER_SPEC_META = {}

# What turns a registry value into markdown. None is the file-backed default:
# the value is a repository-relative path, which is what the bundled registry
# and the user manifest both hold. The Supabase store installs one that takes a
# spec-version row id instead. Additive on purpose -- every existing test and
# corpus golden runs through the default and is untouched by this.
DOCUMENT_SOURCE = None


def use_registry(entries, defaults, meta, document_source):
    """Install a registry and the reader that resolves its values.

    entries: {(name, version): key}, defaults: {name: version},
    meta: {(name, version): {"title": ..., "sourceUrl": ...}},
    document_source: key -> markdown text.
    """
    global SPECS, DEFAULT_VERSION, USER_SPEC_META, DOCUMENT_SOURCE
    SPECS = dict(entries)
    DEFAULT_VERSION = dict(defaults)
    USER_SPEC_META = dict(meta)
    DOCUMENT_SOURCE = document_source


def reset_registry():
    """Back to bundled specs plus the user manifest, reading from disk."""
    global DOCUMENT_SOURCE
    DOCUMENT_SOURCE = None
    load_user_manifest()


def _read_document(spec, version, key):
    if DOCUMENT_SOURCE is not None:
        return DOCUMENT_SOURCE(key)
    try:
        return (REPO_ROOT / key).read_text(encoding="utf-8")
    except OSError as e:
        sys.exit(f"cannot read spec document '{key}' for {spec}@{version}: {e}")


def load_user_manifest(manifest_path=None):
    """Rebuild SPECS / DEFAULT_VERSION / USER_SPEC_META as bundled specs +
    user manifest.

    Idempotent: always restarts from the bundled registry, so calling it
    again after the manifest changed picks up the new state. An absent
    manifest is the normal bundled-only state, not an error; a present but
    malformed one fails loudly BEFORE anything is merged, leaving the
    registry as it was. manifest_path overrides the location (as
    SPEC_CITE_USER_SPECS does for the whole process).
    """
    global SPECS, DEFAULT_VERSION, USER_SPEC_META
    merged = dict(BUNDLED_SPECS)
    defaults = dict(BUNDLED_DEFAULT_VERSION)
    meta = {}
    if manifest_path is None:
        manifest_path = os.environ.get(MANIFEST_ENV_VAR) or USER_MANIFEST_PATH
    path = Path(manifest_path)
    if path.is_file():
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            sys.exit(f"user-spec manifest {path} is not readable JSON: {e}")
        if not isinstance(manifest, dict):
            sys.exit(f"user-spec manifest {path}: top level must be a JSON object")
        for name, versions in manifest.items():
            if name in BUNDLED_DEFAULT_VERSION:
                sys.exit(
                    f"user-spec manifest {path} defines '{name}', a bundled "
                    "spec; user specs cannot shadow bundled specs -- pick "
                    "another name"
                )
            if not SPEC_NAME_RE.match(name):
                sys.exit(
                    f"user-spec manifest {path}: bad spec name '{name}' "
                    "(must match [a-z-]+, the locator grammar's spec identifiers)"
                )
            if not isinstance(versions, dict) or not versions:
                sys.exit(
                    f"user-spec manifest {path}: spec '{name}' must map at "
                    "least one version to an entry"
                )
            explicit_defaults = []
            for version, entry in versions.items():
                if not VERSION_RE.match(version):
                    sys.exit(
                        f"user-spec manifest {path}: bad version '{version}' "
                        f"for '{name}' (must be an ISO date YYYY-MM-DD)"
                    )
                if not isinstance(entry, dict):
                    sys.exit(
                        f"user-spec manifest {path}: entry for "
                        f"'{name}@{version}' must be an object"
                    )
                unknown = sorted(set(entry) - {"path", "default", "title", "sourceUrl"})
                if unknown:
                    sys.exit(
                        f"user-spec manifest {path}: unknown key(s) {unknown} "
                        f"in '{name}@{version}' "
                        "(allowed: path, default, title, sourceUrl)"
                    )
                spec_path = entry.get("path")
                if not isinstance(spec_path, str) or not spec_path:
                    sys.exit(
                        f"user-spec manifest {path}: entry for "
                        f"'{name}@{version}' needs a non-empty \"path\" string"
                    )
                default = entry.get("default", False)
                if not isinstance(default, bool):
                    sys.exit(
                        f"user-spec manifest {path}: 'default' for "
                        f"'{name}@{version}' must be a boolean"
                    )
                entry_meta = {}
                for key in ("title", "sourceUrl"):
                    if key in entry:
                        value = entry[key]
                        if not isinstance(value, str) or not value:
                            sys.exit(
                                f"user-spec manifest {path}: '{key}' for "
                                f"'{name}@{version}' must be a non-empty string"
                            )
                        entry_meta[key] = value
                merged[(name, version)] = spec_path
                meta[(name, version)] = entry_meta
                if default:
                    explicit_defaults.append(version)
            if len(explicit_defaults) > 1:
                sys.exit(
                    f"user-spec manifest {path}: '{name}' marks multiple "
                    f"versions default: {sorted(explicit_defaults)}"
                )
            if explicit_defaults:
                defaults[name] = explicit_defaults[0]
            elif len(versions) == 1:
                defaults[name] = next(iter(versions))
            # several versions and none marked default: load_spec(name, None)
            # reports the choice instead of guessing
    SPECS = merged
    DEFAULT_VERSION = defaults
    USER_SPEC_META = meta


load_user_manifest()


HEADING_RE = re.compile(
    r"^(#{1,6})\s+(.*?)\s*(?:\{#([A-Za-z0-9_-]+)(?:\s+authority=\S+)?\})?\s*$"
)
FENCE_RE = re.compile(r"^(```|~~~)")
LIST_ITEM_RE = re.compile(r"^([-*+]|\d+[.)])\s+")
FOOTNOTE_RE = re.compile(r"\[\^[^\]]+\]")
XREF_RE = re.compile(r"\[\?\]\((#[A-Za-z0-9_-]+)\)")
LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")

# Tokens that end with "." but do not terminate a sentence.
ABBREVIATIONS = {
    "e.g", "i.e", "etc", "vs", "cf", "al", "approx", "no", "vol",
    "dr", "mr", "mrs", "ms", "st", "jr", "sr", "u.s", "u.k",
}


def normalize(text):
    """Mechanical normalization applied to excerpt text (see CITATION.md)."""
    text = FOOTNOTE_RE.sub("", text)
    text = XREF_RE.sub(r"\1", text)
    text = LINK_RE.sub(r"\1", text)
    text = LIST_ITEM_RE.sub("", text)  # leading bullet/number is syntax, not content
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def match_normalize(text):
    """Extra folding used only for `find` matching, never for output."""
    text = normalize(text)
    for a, b in [("‘", "'"), ("’", "'"), ("“", '"'), ("”", '"'),
                 ("—", "---"), ("–", "--"), ("…", "...")]:
        text = text.replace(a, b)
    text = re.sub(r"-{2,}", "-", text)
    text = re.sub(r"\s+", " ", text)
    return text


class Section:
    def __init__(self, level, title, anchor, path, start):
        self.level = level
        self.title = title
        self.anchor = anchor
        self.path = path  # tuple of ancestor titles, self included
        self.start = start  # first line after the heading
        self.end = None  # line of the next heading (any level) or EOF
        self.blocks = None

    @property
    def path_str(self):
        return " > ".join(self.path)


def parse_sections(lines):
    sections = []
    stack = []  # (level, title)
    in_fence = None
    for i, line in enumerate(lines):
        fence = FENCE_RE.match(line)
        if fence:
            if in_fence is None:
                in_fence = fence.group(1)
            elif line.startswith(in_fence):
                in_fence = None
            continue
        if in_fence:
            continue
        m = HEADING_RE.match(line)
        if m and not line.startswith("#!"):
            level = len(m.group(1))
            title = re.sub(r"\s+", " ", m.group(2)).strip()
            for s in sections:
                if s.end is None:
                    s.end = i
            stack = [(lv, t) for lv, t in stack if lv < level]
            stack.append((level, title))
            sections.append(
                Section(level, title, m.group(3), tuple(t for _, t in stack), i + 1)
            )
    for s in sections:
        if s.end is None:
            s.end = len(lines)
    return sections


def segment_blocks(lines, start, end):
    """Blocks in a section's direct span. Returns list of raw-text strings."""
    blocks = []
    cur = []
    in_fence = None

    def flush():
        nonlocal cur
        if cur:
            blocks.append("\n".join(cur))
            cur = []

    i = start
    while i < end:
        line = lines[i]
        fence = FENCE_RE.match(line)
        if fence and in_fence is None:
            # A fenced block: attach to a preceding **Example**: caption block.
            flush()
            fence_lines = [line]
            marker = fence.group(1)
            i += 1
            while i < end:
                fence_lines.append(lines[i])
                if lines[i].startswith(marker):
                    break
                i += 1
            fenced = "\n".join(fence_lines)
            if blocks and re.match(r"^\*\*Example\*\*", blocks[-1]):
                blocks[-1] = blocks[-1] + "\n\n" + fenced
            else:
                blocks.append(fenced)
            i += 1
            continue
        if not line.strip():
            flush()
        elif LIST_ITEM_RE.match(line):
            flush()  # each top-level list item starts a block
            cur.append(line)
        elif line[:1].isspace() or cur:
            cur.append(line)  # continuation (incl. nested list content)
        else:
            cur.append(line)
        i += 1
    flush()
    return blocks


def split_sentences(text):
    """Deterministic sentence split on normalized prose (see CITATION.md)."""
    sentences = []
    buf = ""
    i = 0
    n = len(text)
    while i < n:
        buf += text[i]
        if text[i] in ".!?":
            j = i + 1
            closers = ""
            while j < n and text[j] in "\"'’”)]":
                closers += text[j]
                j += 1
            if j >= n:
                buf += closers
                i = j
                break
            if text[j] == " " and j + 1 < n:
                nxt = text[j + 1]
                tail = re.split(r"[\s(]", buf.rstrip(".!?"))[-1]
                is_abbrev = text[i] == "." and tail.lower() in ABBREVIATIONS
                opens = nxt.isupper() or nxt.isdigit() or nxt in "\"'‘“([*#"
                if opens and not is_abbrev:
                    sentences.append((buf + closers).strip())
                    buf = ""
                    i = j  # closers and the space are consumed
        i += 1
    if buf.strip():
        sentences.append(buf.strip())
    return sentences


def resolve_spec(spec, version):
    """(version, path) for a registered spec, applying the default-version
    rule. Loud failure shared by load_spec and spec_meta."""
    version = version or DEFAULT_VERSION.get(spec)
    path = SPECS.get((spec, version))
    if not path:
        if version is None and any(s == spec for s, _ in SPECS):
            options = ", ".join(
                f"{spec}@{v}" for s, v in sorted(SPECS) if s == spec
            )
            sys.exit(
                f"spec '{spec}' has no default version; pin one of: {options}"
            )
        known = ", ".join(f"{s}@{v}" for s, v in sorted(SPECS))
        sys.exit(f"unknown spec '{spec}@{version}' (known: {known})")
    return version, path


def load_spec(spec, version):
    version, key = resolve_spec(spec, version)
    lines = _read_document(spec, version, key).splitlines()
    return version, parse_sections(lines), lines


def first_heading_title(path, spec, version):
    """Derive a display title from the document's first heading. Used when a
    user-spec manifest entry omits 'title'. Loud if there is no heading."""
    sections = parse_sections(_read_document(spec, version, path).splitlines())
    if not sections:
        sys.exit(
            f"user spec '{spec}@{version}' has no 'title' in its manifest "
            f"entry and no heading in {path} to derive one from -- "
            "add a 'title' to the entry"
        )
    return sections[0].title


def spec_meta(spec, version=None):
    """Rendering metadata for a spec version: {"title": str, "sourceUrl": str|None}.

    'title' is the manifest value when present, else derived from the
    document's first heading. 'sourceUrl' is the manifest value or None.
    Used by surfaces that display a user spec (spec reader / panel UI);
    citation resolution never reads it. version defaults per the manifest.
    """
    version, path = resolve_spec(spec, version)
    entry = USER_SPEC_META.get((spec, version), {})
    title = entry.get("title") or first_heading_title(path, spec, version)
    return {"title": title, "sourceUrl": entry.get("sourceUrl")}


def user_specs():
    """The user-manifest specs only (never bundled): {name: [versions...]},
    versions sorted. Lets a caller enumerate registered user specs, e.g. to
    fold them into the spec reader's document list."""
    out = {}
    for name, ver in SPECS:
        if name in BUNDLED_DEFAULT_VERSION:
            continue
        out.setdefault(name, []).append(ver)
    return {name: sorted(vers) for name, vers in sorted(out.items())}


def find_section(sections, ref):
    ref = ref.strip()
    if ref.startswith("#"):
        hits = [s for s in sections if s.anchor == ref[1:]]
    else:
        parts = tuple(p.strip().lower() for p in re.split(r"\s*[>›]\s*", ref))
        hits = [
            s for s in sections
            if tuple(t.lower() for t in s.path[-len(parts):]) == parts
        ]
    if not hits:
        sys.exit(f"section not found: {ref}")
    if len(hits) > 1:
        opts = "\n  ".join(s.path_str for s in hits)
        sys.exit(f"ambiguous section '{ref}', candidates:\n  {opts}")
    return hits[0]


def section_blocks(sec, lines):
    if sec.blocks is None:
        raw = segment_blocks(lines, sec.start, sec.end)
        sec.blocks = []
        for b in raw:
            if FENCE_RE.match(b) or "\n~~~" in b or "\n```" in b:
                sec.blocks.append({"raw": b, "sentences": None})  # example/code
            else:
                sec.blocks.append({"raw": b, "sentences": split_sentences(normalize(b))})
    return sec.blocks


BLOCK_TOKEN = re.compile(r"^(?:¶|p)(\d+)$", re.IGNORECASE)


def parse_locator(text):
    """Returns (spec, version, section_ref, [(block, s_from, s_to), ...])."""
    parts = [p.strip() for p in re.split(r"\s*[>›]\s*", text.strip())]
    head = parts[0]
    m = re.match(r"^([a-z-]+)(?:@(\d{4}-\d{2}-\d{2}))?$", head)
    if not m:
        sys.exit(f"bad spec identifier: '{head}'")
    spec, version = m.group(1), m.group(2)
    pos = None
    if len(parts) > 1 and re.match(r"^(?:¶|p)\d", parts[-1], re.IGNORECASE):
        pos = parts[-1]
        parts = parts[:-1]
    section_ref = " > ".join(parts[1:]) if len(parts) > 1 else None
    span = None
    if pos:
        rng = re.match(
            r"^(?:¶|p)(\d+)(?:\s*s(\d+)(?:\s*-\s*(?:s?(\d+)|(?:¶|p)(\d+)\s*s(\d+)))?)?$",
            pos.replace(" ", ""), re.IGNORECASE,
        )
        if not rng:
            sys.exit(f"bad position: '{pos}'")
        b1 = int(rng.group(1))
        s1 = int(rng.group(2)) if rng.group(2) else None
        if rng.group(4):  # cross-block range
            span = (b1, s1, int(rng.group(4)), int(rng.group(5)))
        elif rng.group(3):
            span = (b1, s1, b1, int(rng.group(3)))
        elif s1:
            span = (b1, s1, b1, s1)
        else:
            span = (b1, None, b1, None)
    return spec, version, section_ref, span


def get_span_text(sec, lines, span):
    blocks = section_blocks(sec, lines)
    b1, s1, b2, s2 = span
    for b in (b1, b2):
        if not 1 <= b <= len(blocks):
            sys.exit(f"block ¶{b} out of range (section has {len(blocks)} blocks)")
    out = []
    for bi in range(b1, b2 + 1):
        blk = blocks[bi - 1]
        if blk["sentences"] is None:
            out.append(blk["raw"])
            continue
        sents = blk["sentences"]
        lo = s1 if (bi == b1 and s1) else 1
        hi = s2 if (bi == b2 and s2) else len(sents)
        if not (1 <= lo <= hi <= len(sents)):
            sys.exit(
                f"sentence range s{lo}-s{hi} out of range in ¶{bi} "
                f"(has {len(sents)} sentences)"
            )
        out.append(" ".join(sents[lo - 1:hi]))
    return "\n\n".join(out)


def cmd_outline(args):
    spec, _, version = args[0].partition("@")
    version, sections, _ = load_spec(spec, version or None)
    print(f"{spec}@{version}")
    for s in sections:
        anchor = f"  {{#{s.anchor}}}" if s.anchor else ""
        print(f"{'  ' * (s.level - 1)}{s.title}{anchor}")


def cmd_show(args):
    spec, version, ref, _ = parse_locator(args[0])
    version, sections, lines = load_spec(spec, version)
    if not ref:
        sys.exit("show needs a section reference")
    sec = find_section(sections, ref)
    label = f"#{sec.anchor}" if sec.anchor else sec.path_str
    print(f"{spec}@{version} > {label}")
    for i, blk in enumerate(section_blocks(sec, lines), 1):
        if blk["sentences"] is None:
            first = blk["raw"].splitlines()[0]
            print(f"\n¶{i} [example/code block] {first}")
        else:
            print(f"\n¶{i}")
            for j, s in enumerate(blk["sentences"], 1):
                print(f"  s{j}: {s}")


def cmd_resolve(args):
    spec, version, ref, span = parse_locator(args[0])
    version, sections, lines = load_spec(spec, version)
    if not ref:
        sys.exit("resolve needs a section reference")
    sec = find_section(sections, ref)
    if span is None:
        blocks = section_blocks(sec, lines)
        span = (1, None, len(blocks), None)
    print(get_span_text(sec, lines, span))


def cmd_find(args):
    if len(args) < 2:
        sys.exit("find needs a spec and a query, e.g. find constitution@2026-01-20 <query>")
    spec, _, version = args[0].partition("@")
    query = args[1]
    needle = match_normalize(query)
    version, sections, lines = load_spec(spec, version or None)
    found = 0
    for sec in sections:
        for bi, blk in enumerate(section_blocks(sec, lines), 1):
            if blk["sentences"] is None:
                if needle in match_normalize(blk["raw"]):
                    label = f"#{sec.anchor}" if sec.anchor else sec.path_str
                    print(f"{spec}@{version} > {label} > ¶{bi}  [example/code block]")
                    found += 1
                continue
            sents = blk["sentences"]
            joined = ""
            bounds = []
            for s in sents:
                if joined:
                    joined += " "
                bounds.append((len(joined), len(joined) + len(match_normalize(s))))
                joined += match_normalize(s)
            idx = joined.find(needle)
            if idx < 0:
                continue
            end = idx + len(needle)
            lo = next(i for i, (a, b) in enumerate(bounds, 1) if idx < b)
            hi = next(i for i, (a, b) in enumerate(bounds, 1) if end <= b)
            label = f"#{sec.anchor}" if sec.anchor else sec.path_str
            srange = f"s{lo}" if lo == hi else f"s{lo}-{hi}"
            loc = f"{spec}@{version} > {label} > ¶{bi} {srange}"
            print(loc)
            print("  " + " ".join(sents[lo - 1:hi]))
            found += 1
    if not found:
        sys.exit(
            f"find: no passage in {spec}@{version} matches {query!r} "
            "(note: matching is whitespace- and quote-style-insensitive)"
        )


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    cmd, args = sys.argv[1], sys.argv[2:]
    dispatch = {
        "outline": cmd_outline,
        "show": cmd_show,
        "resolve": cmd_resolve,
        "find": cmd_find,
    }
    if cmd not in dispatch:
        print(__doc__)
        sys.exit(f"unknown command: {cmd}")
    dispatch[cmd](args)


if __name__ == "__main__":
    main()
