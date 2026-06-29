# Agent Rules & Custom Instructions

This file contains custom developer instructions and rules that Google AI Studio agents will load and follow at the beginning of every conversation.

## Core Rules

1. **Document-First Context**: Read and analyze all documents in the `doc/` folder at the beginning of every conversation to ensure alignment with specifications, designs, entities, and scenarios.
2. **Document Updates**: When user type '/update docs', review the compeleted tasks in current conversation and app codebase, then update the documents in doc/ according to your review result.

## Document Directory Reference
Below is the list of documents to read at the start of each session:
- `/doc/DATA_ENTITIES.md` (Database models and structures)
- `/doc/DESIGN.md` (Design philosophy, themes, typography)
- `/doc/SPECS.md` (Core functional specifications)
- `/doc/USER_INTERFACES.md` (UI component specifications and layouts)
- `/doc/USE_SCENARIOS.md` (User flows and validation scenarios)
- `/doc/features/recycleContract/IMPLEMENTATION_PLAN.md` (Specialized features and roadmap)
