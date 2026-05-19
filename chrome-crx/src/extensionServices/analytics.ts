import { getStorageValue, setStorageValue, StorageKeys } from './core';

export async function getOrCreateAnonymousId(): Promise<string> {
  let id = await getStorageValue<string>(StorageKeys.ANONYMOUS_ID);
  if (!id) {
    id = crypto.randomUUID();
    await setStorageValue(StorageKeys.ANONYMOUS_ID, id);
  }
  return id;
}
