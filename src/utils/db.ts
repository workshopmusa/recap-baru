import { MangaProject } from '../types';

const DB_NAME = 'MangaRecapDB_v2';
const PROJECTS_STORE = 'projects';
const DB_VERSION = 1;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
    };
  });
}

// Save or Update a single project
export async function saveProjectToDB(project: MangaProject): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      
      // For images, we can do a quick check to make sure they are sorted before saving
      if (project.images) {
        project.images.sort((a, b) => 
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
      }

      const request = store.put(project);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Failed to save project to IndexedDB:', err);
  }
}

// Retrieve all saved projects
export async function loadAllProjectsFromDB(): Promise<MangaProject[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readonly');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = (request.result || []) as MangaProject[];
        // Sort by creation date descending (latest first)
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Failed to load projects from IndexedDB:', err);
    return [];
  }
}

// Delete a single project
export async function deleteProjectFromDB(id: string): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error('Failed to delete project from IndexedDB:', err);
  }
}
