The app is deployed at - [changelog generator](https://changeloggen.fly.dev/)
And here is a quick demo [demo](https://drive.google.com/file/d/1mqxQWBwUgMT8h9k8cS2n3hseV2-f8wWX/view?usp=sharing)

How to run the app locally:
Here is the .env.example:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
SESSION_SECRET="secret"
REDIS_URL="redis url"
OPENAI_API_KEY="key"
PRIVATE_KEY="github private key"
GITHUB_CLIENT_ID="github client id"
GITHUB_CLIENT_SECRET="github client secret"
COHERE_API_KEY="cohere api key for reranking"
CLOUDINARY_CLOUD_NAME="name"
CLOUDINARY_API_KEY="key"
CLOUDINARY_API_SECRET="secret"
ANTHROPIC_API_KEY="key"
```

Create a github app and get client id and private key credentials

Run the command

```sh
npx remix init
```

Start the Postgres Database in [Docker](https://www.docker.com/get-started):

```sh
npm run docker
```

Initial setup:

```sh
npm run setup
```

Run the first build:

```sh
npm run build
```

Start dev server:

```sh
npm run dev
```

How to use the app:

1. Sign in with github
2. Select repo/s to add (in the /select-repos route)
3. Once you have added a repo, you will see an alert to being the ingestion process. Click start to begin the ingesiton. You will see progress updates from the process. If the repo is large, this process may take some time. The process may also stall, so there is a button to "skip" the ingestion. This button will allow you to navigate the app without having to wait for the ingestion (it will keep running in background). The changelog generation is possible without full ingestion, but the results might be of lower quality.
4. The /logs route allows you to see you "logs", create new ones, and view your public changelog site. "logs" are the inidividual units in the changelogs.
5. You can create a new "log" from scratch or from a PR. If you select a PR, it will be automatically generated. You can edit your "logs" in the ../logs/$logId route and you can also navigate to it's public page.
6. In /design you will be able to customize the appearance of your changelog page
7. In /chat you will be able to ask queries to the repo (I implemented this for testing)

The changelog generation process:

1. Summarize the patch of a file in the PR
2. Build a "changelog tree" by augmenting the summary of the changes with summaries of the parent paths.
   For example, if there were changes to the file /app/components/button.tsx, we would create something like
   ```
   /app
   summary of the /app dir
   ---/components
   --- summary of the /components dir
   ------/button.tsx
   ------- summary of the button file
   ------- summary of the changes made to button.tsx
   ```
   The goal is to provide some general context about the codebase so that the llm can infer what effect changes actually have on a repo (rather than just summarizing what changed in the code)

   The summaries for folders and files are generated in the "ingestion" process and are saved in the db.

4. Once we generate the "changelog tree" we prompt an llm to "ask questions". This llm's purpuse is to ask any questions about the patches (based on the "changelog tree") that could be answered by searching in the codebase. For example, if a function called "getLinks" was optimized by batching, we wouldn't necessarily know what the effects of that change were throughout the codebase. In this case, the llm would return ~ "What does the getLinks function do?" as one of the questions to try to get more context.
5. Once we have a list of questions, we query the codebase with with basic RAG.
6. Once we have the answers, we call a final llm with the intial "changelog tree" and a list of question and answer pairs and ask it to generate a changelog.

Codebase ingestion process:

1. First "prune" the folders/files in the repo to get rid of any irrelevant nodes. The purpose of this step is to avoid having to process and embed files which would not enhance the RAG. The pruning is first done statically with some hardcoded values, and then a final pass with an llm.
2. Once we have the final list of paths to ingest for a repo, we build a graph (dag) from all of the nodes, and then trigger an ingestion flow on all of the leaf nodes (i.e. the files).
3. Files (nodes) are "ingested" by a) summarizing the beginning (or most) of the file, b) generating a list of possible questions for the beginning of the file, c) chunking the file, d) generating summaries and possible questions for the chunks. Then all of these augmentations are embedded and saved in the db. The summary of the beginning of the file is saved as the "upstream" summary in the db and is used later on for prompts.
4. Folders follow a similar process. They generate a summary and possible questions based on the summaries of their children. The summary is also saved as the "upstream" summary in the node, and all of the generated text is embedded.
5. The ingestion process continues until it reaches the root node "/"
6. I would have liked to also implement a "downwards pass" to generate dowstream summaries - perhaps this would have embedded more context into the nodes.

- At this point we have a bunch of embeddings in the db for the specific repo and can do regular RAG

For querying the codebase, we do the following:

1. Augment the query by generating HyDE, more questions, etc...
2. Embed the augmentations and do cosine similarity search on the embeddings
3. Rerank top 10 embeddings
4. Include the top 10 embeddings content in the prompt.
5. I would have like to optimize this prompt more, especially since we have so much relational info in the db about nodes. For example, instead of just including the embedding content in the prompt, like "embedding_id: content", we could have created a similar markdown tree to the one generated for the changelog generation. We would include the summaries of parent nodes, group together the embedding content of embeddings from the same node, and sort by line number. This would have probbaly given better answers. Also, the query user and system prompts are extremly simple, so the model hallucinates answers a lot.

Notes:
I would have liked to play with the prompts a lot more. I did not do much tuning of the prompts; the current versions are essentially the v0s which were generated by Claude. Also, all of the llm processes are quite slow - this is probably because almost all the calls are using the structured outputs. Some of the calls could be sped up by switching to regular output.

There are also some minor bugs throughout the app with things like optimistic ui and the real time progress streaming from the backend jobs. These are all things I could have fixed with a little more time.

I would have also liked to allow users to "install" the Github app so that we could automatically generate and publish changelog entries wheneever a PR is merged. It would have also allowed me to keep the codebase index in synch with the Github repo by listening to events.
