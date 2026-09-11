# Parser corpus {#overview authority=root}

A document written to exercise `engine/spec-cite/cite.py`, not to say anything.
It replaces the two lab specs the corpus goldens used to be dumped from, which
left the repository when the index moved to Supabase.

Every construction the parser recognises appears below at least once, and each
section says which rule it is there for. When a rule is added to `cite.py`, add
a section here: a corpus that does not contain a construction cannot notice it
breaking.

## Headings and anchors {#headings}

This section is reached by anchor, as `#headings`. The heading grammar allows an
optional `{#anchor}` and an optional `authority=` attribute inside it, and the
first heading of this document carries both.

### A section reached by path

This one has no anchor, so it is named by the path of its ancestors' titles.
Both locator styles must resolve, because the index has one document of each
kind.

#### Fourth level

##### Fifth level

###### Sixth level

The grammar admits one to six hashes and the outline must show all of them.

## Sentences and abbreviations {#sentences}

A locator may name a span of sentences, so the splitter has to agree with a
reader about where a sentence ends. This paragraph has three. The second one
ends here. And the third mentions e.g. an abbreviation, i.e. a token that ends
in a full stop without ending a sentence, such as etc. or vs. or approx. and the
U.S. and the U.K.

Dr. Smith, Mr. Jones and Ms. Patel walk into a paragraph. No. 4 on the list is
vol. 2, cf. the note above. The span arithmetic must count four sentences here
and not eleven.

A full stop ends a sentence. So does a question mark, does it not? And an
exclamation mark does! A semicolon does not; Polaris writes them
often, and a splitter that treated one as a terminator would split this sentence
in two. The capital after the semicolon is deliberate: the splitter only breaks
where the next character could open a sentence, so a semicolon followed by a
lower-case word would not exercise the rule at all. A colon
does not either: it introduces.

## Blocks {#blocks}

A blank line ends a block. This paragraph is one block.

This is a second block, and it runs
across two source lines, which the parser joins into one block because the
second line continues the first.

    An indented line continues the block it follows rather than starting one.

## Lists {#lists}

Each top-level list item is its own block, which is why a citation can name one:

- A bullet item, with a full stop. And a second sentence, so a span can address
  part of it.
- A second item with a nested list under it:
  - The nested content belongs to the item above, not to a block of its own.
  - So does this.
- A third item.

Ordered lists open blocks the same way:

1. The first, numbered with a full stop.
2. The second.
3) The third, numbered with a parenthesis, which the grammar also admits.

Other bullet markers exist and must behave identically:

* An asterisk item.
+ A plus item.

## Links, cross-references and footnotes {#inline}

Normalisation strips what is syntax and keeps what is content. A [link to
somewhere](https://example.invalid/somewhere) keeps its text and loses its
target. A cross-reference [?](#headings) becomes the anchor it points at. A
footnote marker[^1] is removed entirely, leaving the sentence it was attached to.

[^1]: The footnote body is an ordinary block and is not special-cased.

Whitespace     collapses,
including     across      lines,
so a quote reads as one line however the source was wrapped.

## Fenced blocks {#fences}

A fenced block is one block, and nothing inside it is parsed:

```
# This is not a heading.
- This is not a list item.
[^neither]: is this a footnote.
```

Tildes fence too:

~~~
Still not a heading: #
~~~

## Example captions {#examples}

A fence that follows an example caption attaches to it, so the two are cited
together as one block rather than as two:

**Example**: a caption, followed by its fence

```
The fenced content belongs to the caption above it.
```

**Example**: a caption with no fence

A caption not followed by a fence stays a block on its own.

## Tables and quotes {#tables}

| column | column |
|---|---|
| a table is a block | and its pipes are content |

> A block quote is a block, and its marker is content rather than syntax.

## Emphasis {#emphasis}

**Bold at the start of a block** is how this corpus's own definitions are
written, and the panel's citation quoting treats it as content. *Italic* and
`inline code` are content too.
