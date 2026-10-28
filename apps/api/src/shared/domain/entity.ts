/**
 * WHAT IT DOES:
 * Base class for all Domain Entities.
 * An Entity has a unique identifier that distinguishes it throughout its entire lifecycle.
 *
 * WHY IT IS WRITTEN LIKE THIS:
 * - Entities are compared purely by identity (their ID), NOT by their attributes.
 * - `uniqueIdentifier` is encapsulated and exposed through the `id` getter.
 * - Type parameter `EntityIdentifierType` ensures strict type safety across different entity types (e.g., OrderId vs RoomId).
 */
export abstract class Entity<EntityIdentifierType> {
  protected readonly _uniqueIdentifier: EntityIdentifierType;

  protected constructor(uniqueIdentifier: EntityIdentifierType) {
    if (uniqueIdentifier === null || uniqueIdentifier === undefined) {
      throw new Error('Entity identifier cannot be null or undefined.');
    }
    this._uniqueIdentifier = uniqueIdentifier;
  }

  public get id(): EntityIdentifierType {
    return this._uniqueIdentifier;
  }

  public equals(entityToCompare?: Entity<EntityIdentifierType> | null): boolean {
    if (entityToCompare === null || entityToCompare === undefined) {
      return false;
    }

    if (this === entityToCompare) {
      return true;
    }

    if (!(entityToCompare instanceof Entity)) {
      return false;
    }

    return this._uniqueIdentifier === entityToCompare.id;
  }
}
