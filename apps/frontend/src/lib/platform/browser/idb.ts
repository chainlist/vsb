// IndexedDB as promises: a request's result, and a transaction's end. Awaiting one request after
// another keeps a transaction open, as long as nothing else is awaited in between.

export const request = <T>(r: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});

export const finished = (tx: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(tx.error ?? new Error('the edit was cancelled'));
	});
