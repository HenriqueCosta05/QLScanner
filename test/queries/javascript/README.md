# JavaScript Custom CodeQL Queries

This directory contains small custom CodeQL queries for local testing of the QLScanner custom query flow.

The queries are intentionally simple and focus on common JavaScript security smells:

- `js-eval-call.ql` detects direct `eval(...)` calls.
- `js-document-write.ql` detects `document.write(...)` calls.
- `js-innerhtml-assignment.ql` detects assignments to `.innerHTML`.