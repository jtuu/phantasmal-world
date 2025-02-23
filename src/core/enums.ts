export function enum_values<E>(e: any): E[] {
    const values = Object.values(e);
    const number_values = values.filter(v => typeof v === "number");

    if (number_values.length) {
        return (number_values as any) as E[];
    } else {
        return (values as any) as E[];
    }
}

/**
 * Map with a guaranteed value per enum key.
 */
export class EnumMap<K, V> {
    private readonly keys: K[];
    private readonly values = new Map<K, V>();

    constructor(enum_: any, initial_value: (key: K) => V) {
        this.keys = enum_values(enum_);

        for (const key of this.keys) {
            this.values.set(key, initial_value(key));
        }
    }

    get(key: K): V {
        return this.values.get(key)!;
    }
}
