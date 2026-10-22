import { IsString, Length, Matches } from 'class-validator';

const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;

export class LoginUserDto {
  @IsString()
  @Length(3, 100)
  login!: string;

  @IsString()
  @Length(8, 50)
  @Matches(PASSWORD_COMPLEXITY_REGEX, {
    message:
      'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
  })
  password!: string;
}
