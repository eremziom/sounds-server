import { IsString, Length } from 'class-validator';

export class LoginUserDto {
  @IsString()
  @Length(3, 100)
  login!: string;

  @IsString()
  @Length(6, 50)
  password!: string;
}
