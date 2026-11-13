# Request bodies are checked by hand-written parsers, with no schema library

Status: Accepted

The api checks every request body with a hand-written parser per endpoint, not a runtime schema library such as Zod. Its error messages are user-facing copy. The contract types the request bodies, and both sides build or read bodies through those types, so a renamed field fails the build on both sides (#226). The contract stays free of dependencies (ADR 0004).

## Considered Options

- **A shared Zod schema per body in the contract**, which the api parses with and the web infers its types from. One definition per body, but it adds a runtime dependency to the contract.
- **class-validator DTOs**, the NestJS default. Rejected because it adds a dependency to the api, and its decorated classes can't be shared with the web through the contract the way a Zod schema could.

## Consequences

- Each new endpoint that takes a body needs a contract type, a parser in the api, and specs for its refusals.
- A rule the engine enforces (ADR 0004), such as a draft's start checks or its [Double picks](../../GLOSSARY.md), words its own refusal, and the parser passes that copy on, so a web form checking the same rule shows the same message.
- Switching to Zod is open. It would revise ADR 0004's rule that the contract has no dependencies, and supersede this ADR.
