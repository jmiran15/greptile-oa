// ingest a single file - we can think of a single file as a "document"

// File gets chunked up regularly + all the regular RAG augmentaiton stuff
// while augmenting chunks - we generate a summary of that chunk (small)
// we then combine all of these summaries to create a summary of a file
// then we augment the file summary + generate possible questions for the file
// we do this for all files

// after all of the file stuff is saved in the db - we can start processing folders (i.e. augmenting them and embedding)
// if the file is in a folder, we also create a summary of the folder, based on the summary of all the files + generate possible questions for the folder

// AT INFERENCE TIME (Questions)
// - generate all the possible augmentations, but for code
// rerank with cohere

// CHANGLOG GENERATION PROCESS
// summarize changes + group
// create changelog / group + combine all the changelogs
// ask Questions
// generate final version with answers

// at changelog generation time - for the initial v0.1 of the changelog, we can probably also include the file and folder summaries
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
