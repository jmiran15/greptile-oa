// ingest a codebase

// The codebase structure can be extremely large! so we need to be selective about what we decide is worth ingesting
// Step one is to prune anything from the codebase structure that is irrelevant to the codebase, and should not be embedded (e.g, config files, node_modules, package-lock.json, etc...)
// Then we need to begin the embedding process of everything.

// We take one file at a time ... okay lets think

// the basics should be fine no? Embed these things:
// summaries of the chunk
// relevant names of things being used and what they do
// possible quesitons
// the code itself

// maybe some other stuff that would make the rag really good - we can add more stuff later on!

// at inference time we can basically do the same stuff - just optimized for code.
