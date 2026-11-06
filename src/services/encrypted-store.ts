import {
  SECURE_DATABASE_KEY,
  SECURE_DATABASE_NAME,
  SECURE_DATABASE_STORE,
} from '../db/constants.ts'

export interface StoredDatabase {
  version: 1
  iv: Uint8Array<ArrayBuffer>
  ciphertext: Uint8Array<ArrayBuffer>
  updatedAt: string
}

function indexedDb(): IDBFactory {
  const factory = globalThis.indexedDB

  if (!factory) {
    throw new Error(
      'This browser does not support IndexedDB, which PayNote uses to store the encrypted database.',
    )
  }

  return factory
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb().open(SECURE_DATABASE_NAME, 1)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(SECURE_DATABASE_STORE)) {
        database.createObjectStore(SECURE_DATABASE_STORE)
      }
    }

    request.onerror = () => {
      reject(
        request.error ??
          new Error('The encrypted database could not be opened.'),
      )
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

function readValue<T>(
  store: IDBObjectStore,
  key: IDBValidKey,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const request = store.get(key)

    request.onerror = () => {
      reject(request.error ?? new Error('The encrypted database could not be read.'))
    }

    request.onsuccess = () => {
      resolve((request.result as T | undefined) ?? null)
    }
  })
}

function writeValue(
  store: IDBObjectStore,
  key: IDBValidKey,
  value: StoredDatabase,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(value, key)

    request.onerror = () => {
      reject(
        request.error ?? new Error('The encrypted database could not be saved.'),
      )
    }

    request.onsuccess = () => {
      resolve()
    }
  })
}

export async function readStoredDatabase(): Promise<StoredDatabase | null> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(SECURE_DATABASE_STORE, 'readonly')
    const value = await readValue<unknown>(
      transaction.objectStore(SECURE_DATABASE_STORE),
      SECURE_DATABASE_KEY,
    )

    if (value === null) {
      return null
    }

    if (!isStoredDatabase(value)) {
      throw new Error(
        'The encrypted database is damaged or was created by an incompatible PayNote version.',
      )
    }

    return value
  } finally {
    database.close()
  }
}

function transactionComplete(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve()
    }
    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error('The encrypted database transaction failed.'),
      )
    }
    transaction.onabort = () => {
      reject(
        transaction.error ??
          new Error('The encrypted database transaction was aborted.'),
      )
    }
  })
}

export async function hasStoredDatabase(): Promise<boolean> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(SECURE_DATABASE_STORE, 'readonly')
    const store = transaction.objectStore(SECURE_DATABASE_STORE)

    return await new Promise<boolean>((resolve, reject) => {
      const request = store.count(SECURE_DATABASE_KEY)

      request.onerror = () => {
        reject(
          request.error ??
            new Error('The encrypted database could not be read.'),
        )
      }

      request.onsuccess = () => {
        resolve(request.result > 0)
      }
    })
  } finally {
    database.close()
  }
}

export async function writeStoredDatabase(
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<void> {
  const database = await openDatabase()

  try {
    const transaction = database.transaction(SECURE_DATABASE_STORE, 'readwrite')
    const complete = transactionComplete(transaction)
    await writeValue(
      transaction.objectStore(SECURE_DATABASE_STORE),
      SECURE_DATABASE_KEY,
      {
        version: 1,
        iv: new Uint8Array(iv),
        ciphertext: new Uint8Array(ciphertext),
        updatedAt: new Date().toISOString(),
      },
    )
    await complete
  } finally {
    database.close()
  }
}

export async function deleteStoredDatabase(): Promise<void> {
  const factory = indexedDb()

  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(SECURE_DATABASE_NAME)

    request.onerror = () => {
      reject(
        request.error ??
          new Error('The encrypted database could not be deleted.'),
      )
    }

    request.onsuccess = () => {
      resolve()
    }

    request.onblocked = () => {
      reject(
        new Error(
          'Close other PayNote tabs before erasing the encrypted database.',
        ),
      )
    }
  })
}

function isStoredDatabase(value: unknown): value is StoredDatabase {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Partial<StoredDatabase>
  return (
    record.version === 1 &&
    record.iv instanceof Uint8Array &&
    record.ciphertext instanceof Uint8Array &&
    typeof record.updatedAt === 'string'
  )
}
