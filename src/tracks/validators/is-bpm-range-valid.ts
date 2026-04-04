import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator'
import { BpmRangeDto } from '../bpm-range.dto'

/**
 * Validator for checking if a BPM range is valid.
 * A BPM range is considered valid if the BPM from is less than or equal to the BPM to.
 * @param {ValidationOptions} validationOptions Optional validation options.
 * @returns {(object: Object, propertyName: string) => void} A function that registers the validator with the given object and property name.
 */
export function IsBpmRangeValid(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isBpmRangeValid',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: BpmRangeDto, args: ValidationArguments) {
          const bpm = args.object['bpm']
          return bpm?.bpmFrom <= bpm?.bpmTo
        },
      },
    })
  }
}