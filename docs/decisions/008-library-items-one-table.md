# skills, plugins, connectors, MCP, agents, integrations share ONE table
Status: Accepted (LEAD)

Context: Six near-identical tables would duplicate migrations and code.

Decision: table library_items with kind + key + manifest + config + enabled. The manifest folders under library/ stay the source of truth; the table holds what is installed/enabled.

Consequences: one set of queries; add a kind by extending the check list.
