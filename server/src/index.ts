import express from "express";
import cors from "cors";
import path from "node:path";
import { MetadataStore } from "./store.js";
import { libraryRouter } from "./routes/library.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
const LIBRARY_DIR =
  process.env.LIBRARY_DIR ?? path.resolve(import.meta.dirname, "../../library");

const store = new MetadataStore(LIBRARY_DIR);

app.use(cors());
app.use(express.json());

app.use("/api/library", libraryRouter(LIBRARY_DIR, store));

async function start() {
  await store.load();
  await store.sync();

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Library directory: ${LIBRARY_DIR}`);
  });
}

start();
