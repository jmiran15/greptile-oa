// okay, so essentially we need to get all the tree items that are blobs (because those are the ones that actually have any content)

// ASSUME AT THIS POINT WE HAVE AS INPUT A TREEITEM OF TYPE BLOB

// THIS blob is an entire code file
// heres what we can already do with this info ... chunk - augment chunks - augment file - embed everything

// ingest a single file - we can think of a single file as a "document"

// TODO - we should probably include some codebase context in here somehow?

// I'm thinking we "embed" at the folder level as well - somewhat of an overview/summary of the contents
// We should also embed a summary of each file - + questions for the files as well

// Okay, here is what im thinking:
// File gets chunked up regularly + all the regular RAG augmentaiton stuff
// while augmenting chunks - we generate a summary of that chunk (small)

// we then combine all of these summaries to create a summary of a file
// then we augment the file summary + generate possible questions for the file

// we do this for all files

// MY IDEAL WAY OF DOING THIS IS TURNING THE REPO STRUCTURE INTO A GRAPH - then we can process a level at a time
// first the leaf nodes which are all files
// then the other nodes which are all folders
// it is essentially a dag? (i think so)
// so all the lower nodes depend on the higher nodes

// after all of the file stuff is saved in the db - we can start processing folders (i.e. augmenting them and embedding)

// if the file is in a folder, we also create a summary of the folder, based on the summary of all the files + generate possible questions for the folder

// we do this recursively for all folders (since folders can contain other folders)

// THIS SHOULD GIVE US AN EXTREMELY ROBUST EMBEDDING SET FOR ANY FILE IN THE CODEBASE! + we partition the embedding space so it should take TOO long!

// AT INFERENCE TIME (Questions)
// - just generate all the possible augmentations (like we do for chatmate), but for code

// rerank with cohere

// END INGESTION + INFERENCE

// -> BY TOMORROW
// (/repo) enter repo path, add repo to db, ingest the repo, click on repo and be able to ask a question
// (/changelog) enter the pr path (must match some repo in the db, o/w don't generate) -> generate the changelog

// Sunday should all be Github integration stff + UI

// and monday we will probably finish up.

// CHANGLOG GENERATION PROCESS
// I dont think it will take TOOOO long
// summarize changes + group
// create changelog / group + combine all the changelogs
// ask Questions
// generate final version with answers
// CHANGLOG GENERATION PROCESS

// OKAY - now at changelog generation time - for the initial v0.1 of the changelog, we can probably also include the file and folder summaries
// for example ... if there was a change in /app/utils/openai.ts, we could inlude the summary of app, of utils, and of openai.ts file (at the top of the prompt)

// 1. for all the changes, generate short, but super detailed (i.e. mentiones names, functions names, paths, etc...) explanations of the code (perhaps for the explanation of what the original code does, we can include the summary we already have!), and the changes.
// 2. Use LLM to group related changes (into buckets essentially), then we input all of the grouped (relevant) changes together (their entire code .dif) into a single prompt to create a changelog for that specific section (i.e. for those similar changes, e.g: "made the scraping more performant by ... ")
// 2.05. For each of these diffs... we can include the contextual summaries ^^^ like we mentioned above... AND if the tokens >>> we can just use summaries instead of the actual diffs.
// 2.1. this changelog should be extremely detailed - since it will be passed further down to places that have no context.
// 2.2. If too much code to compile together, apply level of summarization and try again.

// 3. Lets combine all of these changelogs together to form the final v0.1
// should probably have some prompt that is like, "here are the changes that happened in the following files ... then summary of files, summary of the folders, etc..."
// OR... perhaps at the top we can include summaries of all the files AND folders (unique) that were changed?

// 3.1 this should return a very good bullet point list (perhaps have it return a structured output? )

// then we will pass it through another llm which is essentially a "questioner?", i.e. it acts like an end user would, and asks questions about the changes.
// need extremely detailed questiosn with the intention of being able to find the answer in the codebase.
// for example if the changelog says something like "Added batching to the getLinks function"
// the question should be something like "What is the getLinks function used for? How does an end user benefit from this?"
// and we might find an answe that says "..." which enhances the changelog -> "improved the scraping performance of the websie connector by batching our links processing"

// Essentially the main thing this llm will try to do is:
