/**
 * WHAT IT DOES:
 * Base class for all Domain Value Objects (e.g., `Money`, `Address`, `OperatingHours`).
 * Holds immutable properties and provides structural (value-based) equality comparison.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Value Objects have NO identity. Two Value Objects are equal if and only if all their 
 *   attributes are structurally equal.
 * - `Object.freeze()` in the constructor guarantees immutability, preventing state from being mutated in place.
 * - `shallowDeepEqual()` compares primitive fields and nested Value Objects recursively.
 * - Checking constructor name prevents accidental equality between two structurally identical 
 *   but semantically distinct Value Objects.
 */
export abstract class ValueObject<ValueObjectAttributesType extends Record<string, unknown>> {
  protected readonly immutableAttributes: Readonly<ValueObjectAttributesType>;

  protected constructor(attributes: ValueObjectAttributesType) {
    this.immutableAttributes = Object.freeze({ ...attributes });
  }

  /**
   * Provides read-only access to internal attributes.
   */
  public get props(): Readonly<ValueObjectAttributesType> {
    return this.immutableAttributes;
  }

  public equals(valueObjectToCompare?: ValueObject<ValueObjectAttributesType> | null): boolean {
    if (valueObjectToCompare === null || valueObjectToCompare === undefined) {
      return false;
    }

    if (valueObjectToCompare.constructor.name !== this.constructor.name) {
      return false;
    }

    return this.shallowDeepEqual(this.immutableAttributes, valueObjectToCompare.immutableAttributes);
  }

  private shallowDeepEqual(firstObjectToCompare: unknown, secondObjectToCompare: unknown): boolean {
    if (firstObjectToCompare === secondObjectToCompare) {
      return true;
    }

    const isInvalidObject = (target: unknown): boolean =>
      typeof target !== 'object' || target === null;

    if (isInvalidObject(firstObjectToCompare) || isInvalidObject(secondObjectToCompare)) {
      return false;
    }

    const firstObjectKeys = Object.keys(firstObjectToCompare as object);
    const secondObjectKeys = Object.keys(secondObjectToCompare as object);

    if (firstObjectKeys.length !== secondObjectKeys.length) {
      return false;
    }

    for (const attributeKey of firstObjectKeys) {
      if (!Object.prototype.hasOwnProperty.call(secondObjectToCompare, attributeKey)) {
        return false;
      }

      const firstValue = (firstObjectToCompare as Record<string, unknown>)[attributeKey];
      const secondValue = (secondObjectToCompare as Record<string, unknown>)[attributeKey];

      if (firstValue instanceof ValueObject && secondValue instanceof ValueObject) {
        if (!firstValue.equals(secondValue)) {
          return false;
        }
      } else if (firstValue !== secondValue) {
        return false;
      }
    }

    return true;
  }
}
