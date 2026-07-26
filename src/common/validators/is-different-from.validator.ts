import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsDifferentFrom(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDifferentFrom',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const relatedValue = (args.object as Record<string, unknown>)[args.constraints[0]];
          return value !== relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          return `${propertyName} must be different from ${args.constraints[0]}`;
        },
      },
    });
  };
}
