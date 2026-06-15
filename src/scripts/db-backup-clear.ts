import { MongoClient } from 'mongodb';
import fs from 'node:fs/promises';
import path from 'node:path';

import env from '@/configs/env';

interface CollectionBackupSummary {
  collection: string;
  documents: number;
  file: string;
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();

  try {
    const db = client.db();
    const dbName = db.databaseName;
    const timestamp = createTimestamp();
    const backupRoot = path.resolve(process.cwd(), 'backup');
    const backupDir = path.join(backupRoot, `${dbName}-${timestamp}`);

    await ensureDir(backupDir);

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const summaries: CollectionBackupSummary[] = [];

    for (const { name } of collections) {
      const collection = db.collection(name);
      const documents = await collection.find({}).toArray();
      const fileName = `${name}.json`;
      const filePath = path.join(backupDir, fileName);

      await fs.writeFile(filePath, JSON.stringify(documents, null, 2), 'utf-8');
      summaries.push({
        collection: name,
        documents: documents.length,
        file: fileName,
      });
    }

    for (const { name } of collections) {
      await db.collection(name).deleteMany({});
    }

    const manifestPath = path.join(backupDir, 'manifest.json');
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          dbName,
          createdAt: new Date().toISOString(),
          totalCollections: summaries.length,
          collections: summaries,
        },
        null,
        2,
      ),
      'utf-8',
    );

    console.warn(`Backup created: ${backupDir}`);
    console.warn('Database clear completed.');
  }
  finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error('db:backup-clear failed');
  console.error(error);
  process.exit(1);
});
