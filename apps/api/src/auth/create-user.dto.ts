import {
  IsEmail,
  IsString,
  Length,
  IsOptional,
  IsUrl,
  Matches,
} from 'class-validator';

const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;

export class CreateUserDto {
  @IsString({ message: 'Username must be a string' })
  @Length(3, 30, { context: { min: 3, max: 30 } })
  @Matches(/^[^@]*$/, {
    context: { code: 'USERNAME_NO_AT' },
    message: 'Username must not contain @',
  })
  username!: string;

  @IsString({ message: 'Password must be a string' })
  @Length(8, 50, { context: { min: 8, max: 50 } })
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    context: { code: 'PASSWORD_COMPLEXITY' },
    message:
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
  })
  password!: string;

  @IsEmail({}, { message: 'Email must be a valid email address' })
  email!: string;

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @Length(0, 200, { context: { min: 0, max: 200 } })
  bio?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  avatar?: string;
}
