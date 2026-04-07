import {
  IsEmail,
  IsString,
  Length,
  IsOptional,
  IsUrl,
} from 'class-validator'

export class CreateUserDto {
  @IsString({ message: 'Username must be a string' })
  @Length(3, 30)
  username!: string

  @IsString({ message: 'Password must be a string' })
  @Length(6, 50)
  password!: string

  @IsEmail({},{ message: 'Email must be a valid email address' })
  email!: string

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @Length(0, 200)
  bio?: string

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  avatar?: string
}