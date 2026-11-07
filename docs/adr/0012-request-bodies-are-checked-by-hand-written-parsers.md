# Request bodies are checked by hand-written parsers, with no schema library

Status: Accepted

The api checks every request body with a hand-written parser per endpoint, not a runtime schema library such as Zod. Its error messages are user-facing copy. The contract types the request bodies, and both sides build or read bodies through those types, so a renamed field fails the build on both sides (#226). The contract stays free of dependencies (ADR 0004).

## Considered Options

- **A shared Zod schema per body in the contract**, which the api parses with and the web infers its types from. One definition per body, but it adds a runtime dependency to the contract, and the hand-written messages would have to be rebuilt on top of it.

## Consequences

- Each new endpoint that takes a body needs a contract type, a parser in the api, and specs for its refusals.
