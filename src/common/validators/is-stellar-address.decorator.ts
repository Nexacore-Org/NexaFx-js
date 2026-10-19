import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { isValidStellarAccountId } from '../../stellar/stellar-address.util';

/**
 * Validates that a DTO property is a well-formed Stellar account id (G... or
 * M...), checksum included (#1440).
 *
 * `@IsString()` should still be applied where the field is required; this only
 * asserts the Stellar shape so invalid destinations are rejected with a 400 at
 * the edge rather than failing late at Horizon submission.
 */
export function IsStellarAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStellarAddress',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          // Let @IsOptional()/@IsString() cover null/undefined/empty.
          if (value === null || value === undefined || value === '') {
            return true;
          }
          return isValidStellarAccountId(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid Stellar account id`;
        },
      },
    });
  };
}
