import { IsOptional, IsString, Length, IsUrl, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Username must be a string' })
  @Length(3, 30)
  @Matches(/^[^@]*$/, {
    context: { code: 'USERNAME_NO_AT' },
    message: 'Username must not contain @',
  })
  username?: string;

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @Length(0, 200)
  bio?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  avatar?: string;
}
