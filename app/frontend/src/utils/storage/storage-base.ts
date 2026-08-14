export type StorageItemValue = string | number | boolean | null;

export type AssertNoExtras<T> = [T] extends [never] ? true : never;

export abstract class StorageBase {
  abstract getItem<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null>;

  abstract setItem<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean>;

  abstract removeItem(key: string): Promise<boolean>;

  abstract secureGet<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null>;

  abstract secureSet<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean>;

  abstract secureRemove(key: string): Promise<boolean>;

  protected retrieve<Fallback extends StorageItemValue>(
    raw: string | null,
    fallback: Fallback,
  ): Fallback | null {
    if (raw === null || raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed as Fallback;
    } catch {
      return fallback;
    }
  }

  protected warn(method: string, key: string, err: unknown): void {
    console.warn(`[Storage] ${method}("${key}") failed:`, err);
  }
}
